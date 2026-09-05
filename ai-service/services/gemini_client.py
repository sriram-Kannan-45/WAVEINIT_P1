import os
import re
import time
import json
import logging
import requests
from datetime import datetime, timezone
from typing import Dict, Any, Optional

log = logging.getLogger("ai-quiz.gemini-client")


def _parse_retry_delay(response_body: str) -> Optional[int]:
    """Extract retry_delay seconds from Gemini API error response body."""
    try:
        data = json.loads(response_body)
        details = data.get("error", {}).get("details", [])
        for d in details:
            if d.get("retry_delay") and d["retry_delay"].get("seconds"):
                return int(d["retry_delay"]["seconds"])
    except Exception:
        pass
    # Fallback: regex for protobuf-style `retry_delay { seconds: N }`
    m = re.search(r'retry_delay\s*\{[^}]*seconds:\s*(\d+)', response_body)
    if m:
        return int(m.group(1))
    return None


from services.ai_provider import AIProviderError as GeminiTemporaryError
from services.ai_config import get_gemini_credentials, get_gemini_api_key, get_gemini_model, thinking_config


class GeminiClient:
    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        self.api_key = get_gemini_api_key() or api_key
        self.model = get_gemini_model()

        key_exists = bool(self.api_key and self.api_key.strip())
        log.info(f"GEMINI_API_KEY exists: {key_exists}")

        # Use v1beta endpoint for flash/pro models as it is highly compatible with JSON mode
        self.base_url = "https://generativelanguage.googleapis.com/v1beta/models"

    def generate_content(self, prompt, temperature=0.2, response_json=True, doc_name='N/A', file_size='N/A', extracted_text_len=0, first_500_chars='N/A'):
        from services.ai_provider import generate_content
        return generate_content(prompt, gemini_key=self.api_key, model=self.model, temperature=temperature, response_json=response_json)

    def generate_vision_content(
        self,
        prompt: str,
        image_b64: str,
        mime_type: str = "image/jpeg",
        temperature: float = 0.2
    ) -> str:
        """Call Gemini multimodal vision API with inline base64 image data."""
        if not self.api_key or not self.api_key.strip():
            raise ValueError("GEMINI_API_KEY is missing.")

        clean_b64 = image_b64.strip()
        if "," in clean_b64:
            clean_b64 = clean_b64.split(",", 1)[1]

        url = f"{self.base_url}/{self.model}:generateContent"
        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": prompt},
                        {
                            "inlineData": {
                                "mimeType": mime_type,
                                "data": clean_b64
                            }
                        }
                    ]
                }
            ],
            "generationConfig": {
                "temperature": temperature,
                "thinkingConfig": thinking_config(self.model),
                "responseMimeType": "application/json"
            }
        }
        credentials = get_gemini_credentials() or [('GEMINI_API_KEY', self.api_key)]
        deadline = time.monotonic() + 60
        for credential, key in credentials:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            try:
                headers = {'Content-Type': 'application/json', 'x-goog-api-key': key}
                res = requests.post(url, headers=headers, json=payload, timeout=min(remaining, 60 / len(credentials)))
                res.raise_for_status()
                candidate = res.json().get('candidates', [])[0]
                if candidate.get('finishReason', 'STOP') != 'STOP':
                    raise ValueError('Incomplete vision response')
                text = ''.join(p.get('text', '') for p in candidate.get('content', {}).get('parts', []) if not p.get('thought'))
                json.loads(text)
                return text
            except (requests.RequestException, ValueError, IndexError, KeyError, TypeError):
                log.warning('Gemini vision attempt failed credential=%s', credential)
        # The configured Groq text model cannot inspect images.
        raise GeminiTemporaryError(message='Gemini vision is unavailable after trying the configured keys.')

