from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List

import numpy as np

from .chunking import TextChunk
from .config import RAGConfig

try:
    import orjson
except Exception:  # pragma: no cover
    orjson = None
    import json


@dataclass
class RetrievedChunk:
    training_id: str
    chunk_number: int
    chunk_text: str
    score: float


@dataclass
class VectorIndexHandle:
    index_path: Path
    metadata_path: Path
    records: List[Dict[str, Any]]
    index: Any

    def retrieve(self, query_embedding: np.ndarray, top_k: int) -> List[RetrievedChunk]:
        limit = min(top_k, len(self.records))
        if limit == 0:
            return []
        query = np.asarray([query_embedding], dtype="float32")
        scores, indices = self.index.search(query, limit)
        results: List[RetrievedChunk] = []
        for score, idx in zip(scores[0], indices[0]):
            if idx < 0:
                continue
            record = self.records[int(idx)]
            results.append(
                RetrievedChunk(
                    training_id=str(record["training_id"]),
                    chunk_number=int(record["chunk_number"]),
                    chunk_text=str(record["chunk_text"]),
                    score=float(score),
                )
            )
        return results


class FaissVectorStore:
    def __init__(self, config: RAGConfig):
        self.config = config
        self.config.faiss_index_dir.mkdir(parents=True, exist_ok=True)

    def build(
        self,
        training_id: str,
        source_id: str,
        chunks: List[TextChunk],
        embeddings: np.ndarray,
    ) -> VectorIndexHandle:
        import faiss

        if len(chunks) == 0:
            raise ValueError("Cannot build a FAISS index without chunks.")
        vectors = np.asarray(embeddings, dtype="float32")
        index = faiss.IndexFlatIP(vectors.shape[1])
        index.add(vectors)

        safe_training = "".join(ch for ch in str(training_id) if ch.isalnum() or ch in ("-", "_")) or "training"
        safe_source = "".join(ch for ch in str(source_id) if ch.isalnum() or ch in ("-", "_"))[:32] or "source"
        base = self.config.faiss_index_dir / f"{safe_training}_{safe_source}"
        index_path = base.with_suffix(".faiss")
        metadata_path = base.with_suffix(".metadata.json")

        records = []
        for chunk, embedding in zip(chunks, vectors):
            records.append(
                {
                    "training_id": chunk.training_id,
                    "chunk_number": chunk.chunk_number,
                    "chunk_text": chunk.chunk_text,
                    "embedding": embedding.tolist(),
                }
            )

        faiss.write_index(index, str(index_path))
        self._write_json(metadata_path, records)
        return VectorIndexHandle(index_path=index_path, metadata_path=metadata_path, records=records, index=index)

    @staticmethod
    def _write_json(path: Path, data: Any) -> None:
        if orjson is not None:
            path.write_bytes(orjson.dumps(data, option=orjson.OPT_INDENT_2))
        else:  # pragma: no cover
            path.write_text(json.dumps(data, indent=2), encoding="utf-8")

