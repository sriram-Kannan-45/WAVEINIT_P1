"""One server-side Gemini configuration for text, RAG, and vision features."""
import os


def has_key(value):
    return isinstance(value, str) and bool(value.strip()) and not value.strip().lower().startswith(
        ('your-', 'your_', 'placeholder', 'replace-', 'replace_')
    )


def get_gemini_credentials():
    credentials = []
    seen = set()
    for name in ('GEMINI_API_KEY', 'GEMINI_API_KEY2'):
        value = os.getenv(name)
        if has_key(value) and value.strip() not in seen:
            seen.add(value.strip())
            credentials.append((name, value.strip()))
    return credentials


def get_gemini_api_key():
    credentials = get_gemini_credentials()
    return credentials[0][1] if credentials else ''


def get_gemini_model():
    return os.getenv('GEMINI_MODEL', '').strip() or 'gemini-3.5-flash-lite'


def thinking_config(model):
    if model.startswith(('gemini-3.', 'gemini-3-')):
        return {'thinkingLevel': 'minimal' if 'flash-lite' in model else 'low'}
    return {'thinkingBudget': 0}
