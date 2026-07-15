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


class RAGQuizGenerator:
    def __init__(self, config: Optional[RAGConfig] = None):
        self.config = config or RAGConfig()
        self.extractor = TextExtractor(self.config)
        self.cleaner = TextCleaner()
        self.chunker = TokenChunker(self.config)
        self.embeddings = EmbeddingService(self.config)
        self.vector_store = FaissVectorStore(self.config)
        self.generator = RAGQuizGenerationService(self.config)

    def _split_for_summarization(self, text: str, chunk_size: int = 50000) -> List[str]:
        chunks = []
        start = 0
        while start < len(text):
            end = start + chunk_size
            if end >= len(text):
                chunks.append(text[start:])
                break
            # Find a near word boundary or newline
            boundary = text.rfind("\n", start + chunk_size - 1000, end)
            if boundary == -1:
                boundary = text.rfind(" ", start + chunk_size - 500, end)
            if boundary == -1 or boundary <= start:
                boundary = end
            chunks.append(text[start:boundary])
            start = boundary
        return chunks

    def generate(self, request: RAGQuizRequest) -> Dict[str, Any]:
        self._validate_request(request)
        self.config.require_gemini_key()
        raw_text, source_title = self._load_text(request)
        
        # Validate extracted text
        if raw_text is None or not isinstance(raw_text, str) or not raw_text.strip() or len(raw_text.strip()) < 50:
            raise ValueError("Document contains insufficient text.")
            
        clean_text = self.cleaner.clean(raw_text)
        if clean_text is None or not clean_text.strip() or len(clean_text.strip()) < 50:
            raise ValueError("Document contains insufficient text.")

        file_size = "N/A"
        if request.file_path:
            try:
                file_size = f"{Path(request.file_path).stat().st_size} bytes"
            except Exception:
                pass

        # If extracted text exceeds Gemini context limit:
        # - Split into chunks
        # - Summarize each chunk
        # - Merge summaries
        # - Generate quiz from merged summary
        if len(clean_text) > self.config.gemini_context_limit_chars:
            log.info(f"Clean text length ({len(clean_text)}) exceeds Gemini context limit ({self.config.gemini_context_limit_chars}). Summarizing...")
            chunks_to_summarize = self._split_for_summarization(clean_text)
            
            summaries = []
            for i, chunk_text in enumerate(chunks_to_summarize):
                log.info(f"Summarizing chunk {i+1}/{len(chunks_to_summarize)} for large document...")
                summary = self.generator._summarize_chunk(
                    chunk=chunk_text,
                    doc_name=source_title,
                    file_size=file_size,
                    extracted_text_len=len(clean_text),
                    first_500_chars=clean_text[:500]
                )
                summaries.append(summary)
            
            merged_summary = "\n\n".join(summaries)
            log.info(f"Merged summaries length: {len(merged_summary)}")

            quiz: QuizOutput = self.generator.generate(
                context_text=merged_summary,
                source_title=source_title,
                difficulty=request.difficulty,
                number_of_questions=request.number_of_questions,
                question_type=request.question_type,
                doc_name=source_title,
                file_size=file_size,
                extracted_text_len=len(clean_text),
                first_500_chars=clean_text[:500]
            )
            
            metadata = {
                "trainingId": request.training_id,
                "courseId": request.course_id,
                "sourceTitle": source_title,
                "sourceId": self._source_id(clean_text, source_title),
                "embeddingModel": self.embeddings.model_name,
                "faissIndexPath": "None (summarized direct generation)",
                "chunkCount": len(chunks_to_summarize),
                "retrievedChunkNumbers": [],
                "retrievalTopK": 0,
                "cleanTextPreview": clean_text[:50000],
            }
            return quiz.to_response(metadata=metadata)

        # Standard RAG pipeline
        training_id = str(request.training_id or request.course_id or "unassigned")
        chunks = self.chunker.split(clean_text, training_id=training_id)
        if not chunks:
            raise ValueError("Could not create usable text chunks from the learning material.")

        chunk_texts = [chunk.chunk_text for chunk in chunks]
        chunk_embeddings = self.embeddings.embed_documents(chunk_texts)
        source_id = self._source_id(clean_text, source_title)
        index_handle = self.vector_store.build(training_id, source_id, chunks, chunk_embeddings)

        query = self._retrieval_query(request, source_title)
        query_embedding = self.embeddings.embed_query(query)
        retrieved = index_handle.retrieve(query_embedding, top_k=self.config.retrieval_top_k)
        if not retrieved:
            raise ValueError("Retriever did not return context chunks.")

        quiz: QuizOutput = self.generator.generate(
            retrieved_chunks=retrieved,
            source_title=source_title,
            difficulty=request.difficulty,
            number_of_questions=request.number_of_questions,
            question_type=request.question_type,
            doc_name=source_title,
            file_size=file_size,
            extracted_text_len=len(clean_text),
            first_500_chars=clean_text[:500]
        )

        metadata = {
            "trainingId": request.training_id,
            "courseId": request.course_id,
            "sourceTitle": source_title,
            "sourceId": source_id,
            "embeddingModel": self.embeddings.model_name,
            "faissIndexPath": str(index_handle.index_path),
            "chunkCount": len(chunks),
            "retrievedChunkNumbers": [chunk.chunk_number for chunk in retrieved],
            "retrievalTopK": self.config.retrieval_top_k,
            "cleanTextPreview": clean_text[:50000],
        }
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
        if request.number_of_questions < 1 or request.number_of_questions > 50:
            raise ValueError("numberOfQuestions must be between 1 and 50.")
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
