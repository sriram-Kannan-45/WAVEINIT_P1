import os
from pathlib import Path

from dotenv import load_dotenv
from services.ai_config import get_gemini_api_key, get_gemini_model


AI_SERVICE_DIR = Path(__file__).resolve().parents[1]
ENV_FILE = AI_SERVICE_DIR / ".env"
load_dotenv(ENV_FILE)


class RAGConfig:
    max_file_size_bytes = int(os.getenv("AI_MAX_FILE_SIZE_BYTES", str(25 * 1024 * 1024)))
    min_text_chars = int(os.getenv("AI_MIN_TEXT_CHARS", "300"))
    chunk_size_tokens = int(os.getenv("AI_CHUNK_SIZE_TOKENS", "650"))
    chunk_overlap_tokens = int(os.getenv("AI_CHUNK_OVERLAP_TOKENS", "100"))
    retrieval_top_k = int(os.getenv("AI_RETRIEVAL_TOP_K", "5"))
    embedding_model = os.getenv("EMBEDDING_MODEL", "BAAI/bge-large-en-v1.5")
    embedding_fallback_model = os.getenv("EMBEDDING_FALLBACK_MODEL", "intfloat/e5-large-v2")
    max_generation_retries = int(os.getenv("AI_JSON_RETRY_COUNT", "3"))
    faiss_index_dir = Path(os.getenv("FAISS_INDEX_DIR", "vector_store")).resolve()
    gemini_model = get_gemini_model()
    gemini_context_limit_chars = int(os.getenv("GEMINI_CONTEXT_LIMIT_CHARS", "150000"))
    gemini_api_key = get_gemini_api_key()
    env_file = ENV_FILE

    allowed_extensions = {".pdf", ".docx", ".pptx", ".txt"}
    allowed_mimes = {
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "text/plain",
    }

    def has_gemini_key(self) -> bool:
        return bool(self.gemini_api_key and self.gemini_api_key != "your-gemini-api-key-here")

    def require_gemini_key(self) -> None:
        # Compatibility name: either configured live provider can serve RAG.
        from services.ai_provider import has_key
        if not has_key(self.gemini_api_key) and not has_key(os.getenv('GROQ_API_KEY')):
            raise RuntimeError('A Gemini or Groq API key is required for quiz generation.')
