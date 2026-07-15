import logging
from typing import List, Dict, Any

log = logging.getLogger("ai-quiz.duplicate-remover")

class DuplicateRemover:
    def __init__(self, similarity_threshold: float = 0.7):
        self.similarity_threshold = similarity_threshold

    def _text_similarity(self, text1: str, text2: str) -> float:
        words1 = set(str(text1).lower().split())
        words2 = set(str(text2).lower().split())
        if not words1 or not words2:
            return 0.0
        return len(words1 & words2) / len(words1 | words2)

    def remove_duplicate_questions(self, questions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Deduplicate questions based on text similarity of the question text.
        """
        if not questions:
            return []
            
        deduplicated = [questions[0]]
        
        for q in questions[1:]:
            is_dup = False
            q_text = q.get("question", "").strip()
            
            for existing in deduplicated:
                existing_text = existing.get("question", "").strip()
                sim = self._text_similarity(q_text, existing_text)
                
                if sim >= self.similarity_threshold:
                    log.warning(f"Removing duplicate question (similarity {sim:.2f}): '{q_text[:40]}...'")
                    is_dup = True
                    break
                    
            if not is_dup:
                deduplicated.append(q)
                
        return deduplicated

    def remove_duplicate_options(self, questions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Ensures each question has exactly 4 unique, non-empty options.
        If duplicate options are found, they are removed, and replaced with distinct placeholder options.
        """
        for i, q in enumerate(questions):
            options = q.get("options", [])
            if not isinstance(options, list):
                options = []
            
            # Clean options and preserve order
            seen = set()
            unique_options = []
            for opt in options:
                opt_clean = str(opt).strip()
                if opt_clean and opt_clean.lower() not in seen:
                    seen.add(opt_clean.lower())
                    unique_options.append(opt_clean)
            
            # Fallback/fill if we have fewer than 4 unique options
            correct = str(q.get("correctAnswer", "")).strip()
            if correct and correct not in unique_options:
                unique_options.append(correct)
                
            default_distractors = ["development", "testing", "framework", "automation", "concept", "system", "database", "method"]
            for d in default_distractors:
                if len(unique_options) >= 4:
                    break
                if d.lower() not in [uo.lower() for uo in unique_options] and d.lower() != correct.lower():
                    unique_options.append(d)
            
            # Pad with index placeholder if still needed
            idx = 1
            while len(unique_options) < 4:
                placeholder = f"Option {idx}"
                if placeholder.lower() not in [uo.lower() for uo in unique_options]:
                    unique_options.append(placeholder)
                idx += 1
                
            q["options"] = unique_options[:4]
            
        return questions
