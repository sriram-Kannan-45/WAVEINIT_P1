import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
import main
from services.ai_provider import AIProviderError

class RestoredAPITests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client=TestClient(main.app)

    def test_required_routes_are_registered(self):
        paths={route.path for route in main.app.routes}
        self.assertTrue({'/rag/prepare-source','/generate-coding-problems','/generate-course-structure','/generate-quiz-from-prompt','/coding/assist','/review-code','/evaluate'} <= paths)

    def test_extracts_actual_source_without_calling_ai(self):
        text='Today we studied speed, distance and time. Average speed equals total distance divided by elapsed time. Use consistent units.'
        with patch.object(main.gemini_client,'generate_content',side_effect=AssertionError('Extraction must not call AI')):
            response=self.client.post('/rag/prepare-source',json={'text':text,'instructions':'Speed and time'})
        self.assertEqual(response.status_code,200)
        self.assertIn('Average speed',response.json()['text'])

    def test_evaluation_uses_matching_argument_names(self):
        with patch.object(main,'_invoke_json',return_value={'score':80,'feedback':'Correct core concept','isCorrect':True}):
            response=self.client.post('/evaluate',json={'questionText':'What is speed?','modelAnswer':'Distance per time','userAnswer':'Distance divided by time'})
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json()['score'],80)

    def test_code_review_never_returns_a_canned_review(self):
        with patch.object(main,'_invoke_json',side_effect=AIProviderError()):
            response=self.client.post('/review-code',json={'title':'Count vowels','language':'python','code':'text=input()','passed':0,'total':3})
        self.assertEqual(response.status_code,503)
        self.assertNotIn('review',response.json())

    def test_curriculum_failure_never_returns_a_blueprint(self):
        with patch('services.course_structure.generate_structure',side_effect=AIProviderError()):
            response=self.client.post('/generate-course-structure',json={'prompt':'History of ancient Egypt'})
        self.assertEqual(response.status_code,503)
        self.assertNotIn('structure',response.json())
