import hashlib
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional, List

from .chunking import TokenChunker
from .cleaning import TextCleaner
from .config import RAGConfig
from .embeddings import EmbeddingService
from .extraction import TextExtractor
from .generation import RAGQuizGenerationService
from .schemas import QuizOutput, normalize_question_type
from .vector_store import FaissVectorStore

log = logging.getLogger("ai-quiz.orchestrator")


@dataclass
class RAGQuizRequest:
    training_id: Optional[Any] = None
    course_id: Optional[Any] = None
    difficulty: str = "MIXED"
    number_of_questions: int = 10
    question_type: str = "MIXED"
    file_path: Optional[str] = None
    mime_type: Optional[str] = None
    source_url: Optional[str] = None
    text: Optional[str] = None
    source_title: Optional[str] = None
    instructions: Optional[str] = None


class RAGQuizGenerator:
    def __init__(self, config: Optional[RAGConfig] = None):
        self.config = config or RAGConfig()
        self.extractor = TextExtractor(self.config)
        self.cleaner = TextCleaner()
        self.chunker = TokenChunker(self.config)
        self.embeddings = EmbeddingService(self.config)
        self.vector_store = FaissVectorStore(self.config)
        self.generator = RAGQuizGenerationService(self.config)

    def prepare_source(self, request: RAGQuizRequest) -> Dict[str, Any]:
        """Return original source evidence, never synthetic questions or summaries."""
        self._validate_request(request)
        raw_text, title = self._load_text(request)
        text = self.cleaner.clean(raw_text or "")
        if len(text.strip()) < 50:
            raise ValueError("Document contains insufficient text.")
        metadata = {"sourceTitle": title, "sourceId": self._source_id(text, title)}
        if len(text) <= min(self.config.gemini_context_limit_chars, 150000):
            return {"text": text, "metadata": metadata}
        chunks = self.chunker.split(text, training_id=str(request.training_id or request.course_id or "unassigned"))
        vectors = self.embeddings.embed_documents([chunk.chunk_text for chunk in chunks])
        handle = self.vector_store.build(str(request.training_id or request.course_id or "unassigned"), metadata["sourceId"], chunks, vectors)
        query = request.instructions or f"Core concepts and learning outcomes in {title}"
        retrieved = handle.retrieve(self.embeddings.embed_query(query), top_k=self.config.retrieval_top_k)
        if not retrieved:
            raise ValueError("No relevant source evidence could be retrieved.")
        evidence = self.generator._format_context(retrieved)
        metadata.update({"chunkCount": len(chunks), "retrievedChunkNumbers": [chunk.chunk_number for chunk in retrieved], "embeddingModel": self.embeddings.model_name})
        return {"text": evidence, "metadata": metadata}

    def generate(self, request: RAGQuizRequest) -> Dict[str, Any]:
        self.config.require_gemini_key()
        prepared = self.prepare_source(request)
        quiz = self.generator.generate(
            context_text=prepared["text"], source_title=prepared["metadata"]["sourceTitle"],
            difficulty=request.difficulty, number_of_questions=request.number_of_questions,
            question_type=request.question_type, instructions=request.instructions,
        )
        metadata = {**prepared["metadata"], "generationSource": "ai-verified",
                    "cleanTextPreview": prepared["text"][:50000]}
        return quiz.to_response(metadata=metadata)

    def _load_text(self, request: RAGQuizRequest) -> tuple[str, str]:
        if request.text:
            title = request.source_title or "Uploaded learning material"
            return request.text, title
        if request.source_url:
            return self.extractor.extract_from_url(request.source_url), request.source_title or request.source_url
        if request.file_path:
            path = Path(request.file_path)
            title = request.source_title or path.name
            return self.extractor.extract_from_file(request.file_path, request.mime_type), title
        raise ValueError("A file, URL, or text payload is required.")

    def _validate_request(self, request: RAGQuizRequest) -> None:
        if request.number_of_questions < 1 or request.number_of_questions > 100:
            raise ValueError("numberOfQuestions must be between 1 and 100.")
        request.question_type = normalize_question_type(request.question_type)
        sources = [bool(request.text), bool(request.file_path), bool(request.source_url)]
        if sum(sources) != 1:
            raise ValueError("Provide exactly one source: file_path, source_url, or text.")

    @staticmethod
    def _source_id(text: str, source_title: str) -> str:
        digest = hashlib.sha256(f"{source_title}\n{text[:20000]}".encode("utf-8", errors="ignore")).hexdigest()
        return digest[:16]

    @staticmethod
    def _retrieval_query(request: RAGQuizRequest, source_title: str) -> str:
        return (
            f"{source_title}. Generate {request.number_of_questions} {request.question_type} "
            f"{request.difficulty} conceptual scenario application analytical quiz questions. "
            "Important concepts, procedures, tradeoffs, examples, definitions, and learner outcomes."
        )
