import os
from pathlib import Path

from dotenv import load_dotenv


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
    raw_model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    gemini_model = "gemini-2.5-pro" if "pro" in raw_model.lower() else "gemini-2.5-flash"
    gemini_context_limit_chars = int(os.getenv("GEMINI_CONTEXT_LIMIT_CHARS", "150000"))
    gemini_api_key = os.getenv("GEMINI_API_KEY", "")
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
        if not self.has_gemini_key():
            raise RuntimeError(
                f"GEMINI_API_KEY is required for RAG quiz generation. "
                f"Set it in {self.env_file} and restart the AI service."
            )
