import re
import unicodedata
from collections import Counter
from typing import Iterable, List


class TextCleaner:
    page_number_re = re.compile(r"^\s*(?:page\s*)?\d+(?:\s*(?:/|of)\s*\d+)?\s*$", re.I)
    junk_re = re.compile(r"[^\S\r\n]+")
    control_re = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")

    def clean(self, text: str) -> str:
        text = unicodedata.normalize("NFKC", text or "")
        text = text.replace("\r\n", "\n").replace("\r", "\n")
        text = self.control_re.sub(" ", text)
        lines = [self._clean_line(line) for line in text.split("\n")]
        lines = self._remove_page_numbers(lines)
        lines = self._remove_repeated_headers_footers(lines)
        paragraphs = self._to_paragraphs(lines)
        return "\n\n".join(paragraphs).strip()

    def _clean_line(self, line: str) -> str:
        line = self.junk_re.sub(" ", line)
        line = re.sub(r"[•▪■◆●]+", " ", line)
        line = re.sub(r"\s+", " ", line)
        return line.strip()

    def _remove_page_numbers(self, lines: Iterable[str]) -> List[str]:
        return [line for line in lines if not self.page_number_re.match(line)]

    def _remove_repeated_headers_footers(self, lines: List[str]) -> List[str]:
        short_lines = [line for line in lines if 0 < len(line) <= 120]
        counts = Counter(short_lines)
        repeated = {line for line, count in counts.items() if count >= 3}
        return [line for line in lines if line not in repeated]

    def _to_paragraphs(self, lines: List[str]) -> List[str]:
        paragraphs: List[str] = []
        current: List[str] = []
        for line in lines:
            if not line:
                if current:
                    paragraphs.append(" ".join(current).strip())
                    current = []
                continue
            current.append(line)
        if current:
            paragraphs.append(" ".join(current).strip())
        return [paragraph for paragraph in paragraphs if len(paragraph) > 1]

