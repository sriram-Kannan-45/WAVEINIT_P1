import re
from dataclasses import dataclass
from typing import List

from .config import RAGConfig


@dataclass(frozen=True)
class TextChunk:
    training_id: str
    chunk_number: int
    chunk_text: str
    token_count: int


class TokenChunker:
    token_re = re.compile(r"\w+|[^\w\s]", re.UNICODE)

    def __init__(self, config: RAGConfig):
        self.config = config

    def split(self, text: str, training_id: str) -> List[TextChunk]:
        paragraphs = [paragraph.strip() for paragraph in re.split(r"\n{2,}", text) if paragraph.strip()]
        chunks: List[TextChunk] = []
        current: List[str] = []
        current_tokens = 0

        for paragraph in paragraphs:
            tokens = self._tokens(paragraph)
            if len(tokens) > self.config.chunk_size_tokens:
                if current:
                    chunks.append(self._make_chunk(training_id, len(chunks), current))
                    current, current_tokens = self._overlap_from_text(chunks[-1].chunk_text)
                for window in self._split_long_tokens(tokens):
                    chunks.append(
                        TextChunk(
                            training_id=training_id,
                            chunk_number=len(chunks),
                            chunk_text=self._detokenize(window),
                            token_count=len(window),
                        )
                    )
                current, current_tokens = self._overlap_from_text(chunks[-1].chunk_text)
                continue

            if current and current_tokens + len(tokens) > self.config.chunk_size_tokens:
                chunks.append(self._make_chunk(training_id, len(chunks), current))
                current, current_tokens = self._overlap_from_text(chunks[-1].chunk_text)

            current.append(paragraph)
            current_tokens += len(tokens)

        if current:
            chunks.append(self._make_chunk(training_id, len(chunks), current))

        return [chunk for chunk in chunks if chunk.token_count >= 30 or len(chunks) == 1]

    def _make_chunk(self, training_id: str, chunk_number: int, paragraphs: List[str]) -> TextChunk:
        text = "\n\n".join(paragraphs).strip()
        return TextChunk(
            training_id=training_id,
            chunk_number=chunk_number,
            chunk_text=text,
            token_count=len(self._tokens(text)),
        )

    def _tokens(self, text: str) -> List[str]:
        return self.token_re.findall(text)

    def _split_long_tokens(self, tokens: List[str]) -> List[List[str]]:
        windows: List[List[str]] = []
        step = max(1, self.config.chunk_size_tokens - self.config.chunk_overlap_tokens)
        for start in range(0, len(tokens), step):
            window = tokens[start : start + self.config.chunk_size_tokens]
            if window:
                windows.append(window)
            if start + self.config.chunk_size_tokens >= len(tokens):
                break
        return windows

    def _overlap_from_text(self, text: str) -> tuple[List[str], int]:
        tokens = self._tokens(text)
        overlap = tokens[-self.config.chunk_overlap_tokens :]
        if not overlap:
            return [], 0
        return [self._detokenize(overlap)], len(overlap)

    @staticmethod
    def _detokenize(tokens: List[str]) -> str:
        text = " ".join(tokens)
        text = re.sub(r"\s+([,.;:!?%)\]])", r"\1", text)
        text = re.sub(r"([(\[])\s+", r"\1", text)
        return text

