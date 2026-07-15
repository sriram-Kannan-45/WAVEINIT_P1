import logging
from typing import List

import numpy as np

from .config import RAGConfig

log = logging.getLogger("ai-quiz.rag.embeddings")


class EmbeddingService:
    def __init__(self, config: RAGConfig):
        self.config = config
        self._model = None
        self._model_name = config.embedding_model

    @property
    def model_name(self) -> str:
        return self._model_name

    def _load_model(self):
        if self._model is not None:
            return self._model
        from sentence_transformers import SentenceTransformer

        try:
            log.info("Loading embedding model: %s", self.config.embedding_model)
            self._model = SentenceTransformer(self.config.embedding_model)
            self._model_name = self.config.embedding_model
        except Exception as exc:
            log.warning(
                "Could not load preferred embedding model %s: %s. Falling back to %s",
                self.config.embedding_model,
                exc,
                self.config.embedding_fallback_model,
            )
            self._model = SentenceTransformer(self.config.embedding_fallback_model)
            self._model_name = self.config.embedding_fallback_model
        return self._model

    def embed_documents(self, texts: List[str]) -> np.ndarray:
        model = self._load_model()
        prepared = [self._prefix_document(text) for text in texts]
        embeddings = model.encode(
            prepared,
            batch_size=8,
            convert_to_numpy=True,
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        return np.asarray(embeddings, dtype="float32")

    def embed_query(self, text: str) -> np.ndarray:
        model = self._load_model()
        embedding = model.encode(
            [self._prefix_query(text)],
            convert_to_numpy=True,
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        return np.asarray(embedding, dtype="float32")[0]

    def _prefix_document(self, text: str) -> str:
        if "e5" in self._model_name.lower():
            return f"passage: {text}"
        return text

    def _prefix_query(self, text: str) -> str:
        if "e5" in self._model_name.lower():
            return f"query: {text}"
        return text

