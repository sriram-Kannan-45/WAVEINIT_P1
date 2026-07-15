import os
import logging
from typing import Dict, Any

log = logging.getLogger("ai-quiz.prompt-builder")

class PromptBuilder:
    def __init__(self, prompts_dir: str = None):
        if prompts_dir is None:
            # Locate prompts directory relative to this service file: services/../prompts
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            prompts_dir = os.path.join(base_dir, "prompts")
            
        self.prompts_dir = prompts_dir
        log.info(f"Initialized PromptBuilder with prompts directory: {self.prompts_dir}")

    def _load_prompt(self, filename: str) -> str:
        filepath = os.path.join(self.prompts_dir, filename)
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"Required prompt file not found: {filepath}")
            
        with open(filepath, 'r', encoding='utf-8') as f:
            return f.read().strip()

    def build_topic_prompt(self, text: str) -> str:
        template = self._load_prompt("topic_prompt.txt")
        return template.replace("{text}", text)

    def build_concept_prompt(self, topics_json: str) -> str:
        template = self._load_prompt("concept_prompt.txt")
        return template.replace("{topics_json}", topics_json)

    def build_definition_prompt(self, concepts_json: str) -> str:
        template = self._load_prompt("definition_prompt.txt")
        return template.replace("{concepts_json}", concepts_json)

    def build_quiz_prompt(self, concepts_and_definitions_json: str, num_questions: int, difficulty: str, counts: Dict[str, int]) -> str:
        template = self._load_prompt("quiz_prompt.txt")
        return (template
                .replace("{concepts_and_definitions_json}", concepts_and_definitions_json)
                .replace("{num_questions}", str(num_questions))
                .replace("{difficulty}", str(difficulty))
                .replace("{concept_count}", str(counts.get("Concept", 0)))
                .replace("{definition_count}", str(counts.get("Definition", 0)))
                .replace("{application_count}", str(counts.get("Application", 0)))
                .replace("{scenario_count}", str(counts.get("Scenario", 0)))
                .replace("{practical_count}", str(counts.get("Practical", 0))))
