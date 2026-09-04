"""Shared live text provider for the Python service; credentials never leave headers."""
import json
import logging
import os
import time
import uuid
import requests

log = logging.getLogger('ai-provider')

class AIProviderError(RuntimeError):
    def __init__(self, status_code=503, message='Both live AI providers are unavailable.', retries=0):
        self.status_code = status_code
        self.api_message = message
        self.retries = retries
        super().__init__(message)

def has_key(value):
    return bool(value and value.strip() and not value.lower().startswith(('your-', 'your_', 'placeholder', 'replace-')))

def generate_content(prompt, *, gemini_key=None, model=None, response_json=True, temperature=0.2, timeout=60):
    deadline = time.monotonic() + timeout
    request_id = str(uuid.uuid4())
    failures = []
    for provider, key in [('gemini', gemini_key or os.getenv('GEMINI_API_KEY')), ('groq', os.getenv('GROQ_API_KEY'))]:
        if not has_key(key):
            failures.append(f'{provider}: missing key')
            log.warning('AI failure request=%s provider=%s reason=MISSING_KEY', request_id, provider)
            continue
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            failures.append(f'{provider}: timeout')
            continue
        selected = (model or os.getenv('GEMINI_MODEL', 'gemini-2.5-flash-lite')) if provider == 'gemini' else os.getenv('GROQ_MODEL', 'openai/gpt-oss-120b')
        log.info('AI attempt request=%s provider=%s model=%s', request_id, provider, selected)
        try:
            if provider == 'gemini':
                payload = {'contents':[{'parts':[{'text':prompt}]}], 'generationConfig':{'temperature':temperature,'maxOutputTokens':8000,'thinkingConfig':{'thinkingBudget':0}}}
                if response_json:
                    payload['generationConfig']['responseMimeType'] = 'application/json'
                response = requests.post(f'https://generativelanguage.googleapis.com/v1beta/models/{selected}:generateContent',headers={'x-goog-api-key':key.strip()},json=payload,timeout=min(20,remaining*.4))
            else:
                payload = {'model':selected,'messages':[{'role':'system','content':'Answer accurately. Return only a valid JSON object.' if response_json else 'Give accurate, concise educational guidance.'},{'role':'user','content':prompt}], 'temperature':temperature,'max_completion_tokens':8000}
                if response_json:
                    payload['response_format']={'type':'json_object'}
                if selected.startswith('openai/gpt-oss-'):
                    payload['reasoning_effort']='low'
                response = requests.post('https://api.groq.com/openai/v1/chat/completions',headers={'Authorization':f'Bearer {key.strip()}'},json=payload,timeout=remaining)
            response.raise_for_status()
            data=response.json()
            if provider == 'gemini':
                candidate=data.get('candidates',[{}])[0]
                text=''.join(p.get('text','') for p in candidate.get('content',{}).get('parts',[]) if not p.get('thought'))
                finished=candidate.get('finishReason')=='STOP'
            else:
                candidate=data.get('choices',[{}])[0]
                text=candidate.get('message',{}).get('content','')
                finished=candidate.get('finish_reason')=='stop'
            if not finished or not isinstance(text,str) or not text.strip():
                raise ValueError('invalid response')
            if response_json:
                json.loads(text)
            log.info('AI success request=%s provider=%s fallback=%s',request_id,provider,bool(failures))
            return text.strip()
        except requests.Timeout:
            reason='timeout'
        except requests.HTTPError as error:
            status=error.response.status_code if error.response is not None else 0
            reason={401:'invalid key or access',403:'invalid key or access',429:'rate or quota limit'}.get(status,f'API failure ({status})')
        except requests.RequestException:
            reason='connection failure'
        except (ValueError,IndexError,KeyError,TypeError):
            reason='invalid response'
        failures.append(f'{provider}: {reason}')
        log.warning('AI failure request=%s provider=%s reason=%s next=%s',request_id,provider,reason,'groq' if provider=='gemini' else 'none')
    raise AIProviderError(message='Live AI unavailable. ' + '; '.join(failures) + '. No generated content was saved.')
