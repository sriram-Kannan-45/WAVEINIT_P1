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


class GeminiTemporaryError(RuntimeError):
    """Raised when Gemini API returns a temporary error (503, 429, etc.) after all retries."""
    def __init__(self, status_code: int, message: str, retries: int = 0):
        self.status_code = status_code
        self.api_message = message
        self.retries = retries
        super().__init__(f"Gemini API error ({status_code}) after {retries} retries: {message}")


class GeminiClient:
    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        self.api_key = api_key or os.getenv("GEMINI_API_KEY", "")
        raw_model = model or os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
        
        # Verify and coerce/fallback model name
        if raw_model not in ("gemini-2.5-flash", "gemini-2.5-pro"):
            if "pro" in raw_model.lower():
                self.model = "gemini-2.5-pro"
            else:
                self.model = "gemini-2.5-flash"
            log.warning(f"Invalid model '{raw_model}' verified and coerced to '{self.model}'.")
        else:
            self.model = raw_model
            log.info(f"Model name verified: '{self.model}'")
            
        key_exists = bool(self.api_key and self.api_key.strip())
        log.info(f"GEMINI_API_KEY exists: {key_exists}")

        # Use v1beta endpoint for flash/pro models as it is highly compatible with JSON mode
        self.base_url = "https://generativelanguage.googleapis.com/v1beta/models"

    def generate_content(
        self,
        prompt: str,
        temperature: float = 0.2,
        response_json: bool = True,
        doc_name: str = "N/A",
        file_size: str = "N/A",
        extracted_text_len: int = 0,
        first_500_chars: str = "N/A",
    ) -> str:
        """
        Call the Gemini REST API directly using requests.
        Implements exponential backoff and retries.
        """
        # Validate API key
        if not self.api_key or not self.api_key.strip():
            raise ValueError("GEMINI_API_KEY is null, empty, or missing from environment variables.")

        url = f"{self.base_url}/{self.model}:generateContent?key={self.api_key}"
        headers = {'Content-Type': 'application/json'}
        
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": temperature
            }
        }
        
        if response_json:
            payload["generationConfig"]["responseMimeType"] = "application/json"

        # Print/log the before state
        log.info(
            f"\nBefore Gemini:\n"
            f"---------------------\n"
            f"Document Name: {doc_name}\n"
            f"File Size: {file_size}\n"
            f"Extracted Text Length: {extracted_text_len}\n"
            f"First 500 chars: {first_500_chars}\n"
            f"Model Name: {self.model}\n"
            f"Prompt Length: {len(prompt)}\n"
            f"---------------------"
        )
        # Print the complete Gemini request payload (excluding API key)
        log.info(f"Gemini Request Payload:\n{json.dumps(payload, indent=2)}")

        max_retries = 5
        last_error = None
        temporary_status_codes = (408, 429, 500, 502, 503, 504)
        
        for attempt in range(1, max_retries + 1):
            start_time = time.time()
            try:
                log.info(f"Sending request to Gemini model {self.model} (Attempt {attempt}/{max_retries})...")
                response = requests.post(url, headers=headers, json=payload, timeout=90)
                
                elapsed = time.time() - start_time
                status_code = response.status_code
                response_body = response.text
                
                # Try parsing usage / finish reason
                token_usage = "N/A"
                finish_reason = "N/A"
                res_data = None
                try:
                    res_data = response.json()
                    candidates = res_data.get("candidates", [])
                    if candidates:
                        finish_reason = candidates[0].get("finishReason", "N/A")
                    usage = res_data.get("usageMetadata", {})
                    if usage:
                        token_usage = (
                            f"Prompt: {usage.get('promptTokenCount', 0)}, "
                            f"Candidates: {usage.get('candidatesTokenCount', 0)}, "
                            f"Total: {usage.get('totalTokenCount', 0)}"
                        )
                except Exception as parse_err:
                    log.warning(f"Could not parse response JSON for usage/finish reason: {parse_err}")

                # Print/log the after state
                log.info(
                    f"\nAfter Gemini:\n"
                    f"---------------------\n"
                    f"Status Code: {status_code}\n"
                    f"Response Body: {response_body}\n"
                    f"Token Usage: {token_usage}\n"
                    f"Finish Reason: {finish_reason}\n"
                    f"---------------------"
                )
                
                # Print the complete Gemini response
                if res_data:
                    log.info(f"Complete Gemini Response:\n{json.dumps(res_data, indent=2)}")
                else:
                    log.info(f"Complete Gemini Response (raw):\n{response_body}")

                response.raise_for_status()
                
                if not res_data:
                    raise ValueError(f"Gemini API returned empty or invalid response: {response_body}")
                
                candidates = res_data.get("candidates", [])
                if not candidates:
                    raise ValueError(f"Gemini API returned no candidates. Full response: {res_data}")
                    
                parts = candidates[0].get("content", {}).get("parts", [])
                if not parts:
                    raise ValueError(f"Gemini API candidate content contains no parts. Full response: {res_data}")
                    
                text_content = parts[0].get("text", "")
                return text_content.strip()
                
            except requests.exceptions.HTTPError as he:
                last_error = he
                status_code = he.response.status_code if he.response is not None else "Unknown"
                detail = he.response.text if he.response is not None else ""
                elapsed = time.time() - start_time
                log.error(
                    f"HTTP error {status_code} during Gemini API call: {detail}"
                )
                
                log.info(
                    f"Retry attempt {attempt}/{max_retries} | "
                    f"Model: {self.model} | "
                    f"Status: {status_code} | "
                    f"Response time: {elapsed:.2f}s | "
                    f"Error: {detail[:200]}"
                )
                
                if status_code in temporary_status_codes:
                    if attempt < max_retries:
                        wait_time = 2 ** attempt
                        # Use retry_delay from server when available (especially for 429 quota)
                        if status_code == 429:
                            retry_delay = _parse_retry_delay(detail)
                            if retry_delay is not None:
                                wait_time = max(wait_time, retry_delay + 5)
                        log.info(f"Retrying in {wait_time}s on status {status_code} (attempt {attempt}/{max_retries})...")
                        time.sleep(wait_time)
                        continue
                    else:
                        api_message = ""
                        try:
                            err_json = he.response.json()
                            api_message = err_json.get("error", {}).get("message", "")
                        except Exception:
                            pass
                        if not api_message:
                            api_message = detail
                        raise GeminiTemporaryError(
                            status_code=status_code,
                            message=api_message,
                            retries=max_retries
                        )
                break
                
            except requests.exceptions.Timeout as toe:
                elapsed = time.time() - start_time
                log.error(f"Timeout after {elapsed:.2f}s on attempt {attempt}/{max_retries}: {str(toe)}")
                if attempt < max_retries:
                    wait_time = 2 ** attempt
                    log.info(f"Retrying in {wait_time}s after timeout (attempt {attempt}/{max_retries})...")
                    time.sleep(wait_time)
                    continue
                raise GeminiTemporaryError(
                    status_code=504,
                    message=f"Request timed out after {elapsed:.2f}s",
                    retries=max_retries
                )
                
            except Exception as e:
                last_error = e
                elapsed = time.time() - start_time
                log.error(f"Exception during Gemini API call on attempt {attempt}/{max_retries}: {str(e)}")
                if attempt < max_retries:
                    wait_time = 2 ** attempt
                    log.info(f"Retrying in {wait_time}s after exception (attempt {attempt}/{max_retries})...")
                    time.sleep(wait_time)
                    continue
                
        if last_error:
            if isinstance(last_error, requests.exceptions.HTTPError):
                status_code = last_error.response.status_code if last_error.response is not None else "Unknown"
                api_message = ""
                try:
                    err_json = last_error.response.json()
                    api_message = err_json.get("error", {}).get("message", "")
                except Exception:
                    pass
                if not api_message:
                    api_message = last_error.response.text if last_error.response is not None else str(last_error)
                if self.api_key and self.api_key in api_message:
                    api_message = api_message.replace(self.api_key, "HIDDEN_KEY")
                raise RuntimeError(f"Gemini API error ({status_code}): {api_message}")
            else:
                err_msg = str(last_error)
                if self.api_key and self.api_key in err_msg:
                    err_msg = err_msg.replace(self.api_key, "HIDDEN_KEY")
                raise RuntimeError(f"Gemini API request failed: {err_msg}")
        raise RuntimeError("Failed to generate content from Gemini API after retries.")

