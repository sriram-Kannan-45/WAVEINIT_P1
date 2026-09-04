import json
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from rag.generation import RAGQuizGenerationService, QuizGenerationError
from services.gemini_client import GeminiTemporaryError


class DynamicSourceGenerationTests(unittest.TestCase):
    def setUp(self):
        self.config = Mock(gemini_api_key='test-only', gemini_model='test-only', max_generation_retries=3)
        self.service = RAGQuizGenerationService(self.config)
        self.service.client = Mock()
        self.intent = {'valid': True, 'topic': 'Speed, Distance, and Time', 'domain': 'Mathematics', 'concepts': ['speed'], 'requirements': [], 'marksPerQuestion': 2}
        self.first = {'slot': 0, 'questionType': 'MCQ', 'question': 'A bus covers 150 km in 3 hours. What is its average speed?', 'options': ['30 km/h', '50 km/h', '60 km/h', '90 km/h'], 'correctAnswer': '50 km/h', 'explanation': 'Speed is 150 divided by 3, or 50 km/h.', 'difficulty': 'Medium', 'topic': 'Average speed'}
        self.second = {**self.first, 'slot': 1, 'question': 'A cyclist travels at 12 km/h for 2 hours. How far does the cyclist travel?', 'options': ['6 km', '10 km', '24 km', '30 km'], 'correctAnswer': '24 km', 'explanation': 'Distance is speed times time: 12 times 2 = 24 km.'}
        self.review = {'index': 0, 'relevant': True, 'unique': True, 'sourceSupported': True, 'unambiguous': True, 'explanationCorrect': True, 'difficultyCorrect': True, 'correctAnswer': '50 km/h', 'reason': ''}

    def generate(self, count=2):
        return self.service.generate(context_text='Speed equals distance divided by time. Distance equals speed times time.', source_title='notes.txt', difficulty='MEDIUM', number_of_questions=count, question_type='MCQ')

    def respond(self, *responses):
        self.service.client.generate_content.side_effect = [json.dumps(r) for r in responses]

    def test_repairs_only_invalid_questions(self):
        self.respond(self.intent, {'questions': [self.first, self.second]}, {'reviews': [self.review, {**self.review, 'index': 1, 'relevant': False}]}, {'questions': [self.second]}, {'reviews': [{**self.review, 'correctAnswer': '24 km'}]})
        result = self.generate()
        self.assertEqual(result.title, 'Quiz: Speed, Distance, and Time')
        self.assertEqual([q.marks for q in result.questions], [2, 2])
        self.assertEqual(result.questions[0].question, self.first['question'])
        repair_prompt = self.service.client.generate_content.call_args_list[3].args[0]
        self.assertIn('"missingSlots": [{"slot": 1', repair_prompt)
        self.assertIn('"accepted": [{', repair_prompt)

    def test_structural_failure_keeps_valid_candidate(self):
        self.respond(self.intent, {'questions': [self.first, {**self.second, 'options': ['Option A', 'Option B', 'Option C', 'Option D']}]}, {'reviews': [self.review]}, {'questions': [self.second]}, {'reviews': [{**self.review, 'correctAnswer': '24 km'}]})
        self.assertEqual(len(self.generate().questions), 2)

    def test_source_review_rejects_wrong_answer(self):
        self.respond(self.intent, {'questions': [self.first]}, {'reviews': [{**self.review, 'correctAnswer': '90 km/h'}]}, {'questions': [self.first]}, {'reviews': [self.review]})
        self.assertEqual(self.generate(1).questions[0].correctAnswer, '50 km/h')

    def test_quota_failure_never_returns_fallback(self):
        self.service.client.generate_content.side_effect = GeminiTemporaryError(429, 'quota exhausted')
        with self.assertRaises(GeminiTemporaryError):
            self.generate()

    def test_exhaustion_never_returns_partial_quiz(self):
        self.respond(self.intent, {'questions': []}, {'questions': []}, {'questions': []})
        with self.assertRaises(QuizGenerationError):
            self.generate()

    def test_part_variants_rejected(self):
        invalid = {**self.first, 'question': self.first['question'] + ' Part 2'}
        self.respond(self.intent, {'questions': [invalid]}, {'questions': [self.first]}, {'reviews': [self.review]})
        self.assertNotIn('Part 2', self.generate(1).questions[0].question)

    def test_no_json_answer_repair(self):
        with self.assertRaises(ValueError):
            self.service._parse('{"questions": [')


if __name__ == '__main__':
    unittest.main()
