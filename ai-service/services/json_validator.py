import re
import json
import logging
from typing import Dict, Any, Union, Optional

log = logging.getLogger("ai-quiz.json-validator")

class JSONValidator:
    def __init__(self):
        pass

    def validate_and_parse(self, raw_text: str) -> Union[Dict[str, Any], list]:
        """
        Parse raw text to JSON. Attempts standard parsing, regex extraction of JSON blocks,
        and json-repair fallback to guarantee a valid output.
        """
        cleaned = raw_text.strip()
        
        # 1. Strip markdown fences if present
        fence_match = re.search(r"```(?:json)?\s*(.*?)```", cleaned, re.DOTALL | re.IGNORECASE)
        if fence_match:
            cleaned = fence_match.group(1).strip()
            
        # 2. Try standard json loads
        try:
            return json.loads(cleaned)
        except Exception:
            pass

        # 3. Try to locate array or object boundaries
        obj_match = re.search(r"(\{.*\}|\[.*\])", cleaned, re.DOTALL)
        if obj_match:
            try:
                return json.loads(obj_match.group(1))
            except Exception:
                cleaned = obj_match.group(1)

        # 4. Fallback to json-repair
        try:
            from json_repair import repair_json
            repaired = repair_json(cleaned, return_objects=True)
            if isinstance(repaired, (dict, list)):
                log.info("Successfully repaired malformed JSON using json-repair.")
                return repaired
        except Exception as e:
            log.error(f"json-repair failed to parse JSON: {e}")

        # Return empty dictionary as last resort
        return {}
