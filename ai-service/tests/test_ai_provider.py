import json
import os
import unittest
from unittest.mock import patch, Mock
import requests
from services.ai_provider import generate_content, AIProviderError
from services.ai_config import get_gemini_api_key, get_gemini_model
from services.gemini_client import GeminiClient

class ProviderTests(unittest.TestCase):
    @patch.dict(os.environ, {'GEMINI_API_KEY': 'key-one', 'GEMINI_API_KEY2': 'key-two', 'GROQ_API_KEY': 'key-three'}, clear=True)
    @patch('services.ai_provider.requests.post')
    def test_second_gemini_key_recovers_without_groq(self, post):
        failed = Mock(status_code=429)
        failed.raise_for_status.side_effect = requests.HTTPError(response=failed)
        success = Mock()
        success.json.return_value = {'candidates': [{'finishReason': 'STOP', 'content': {'parts': [{'text': '{"ok":true}'}]}}]}
        post.side_effect = [failed, success]
        self.assertEqual(json.loads(generate_content('Public fixture')), {'ok': True})
        self.assertEqual([c.kwargs['headers']['x-goog-api-key'] for c in post.call_args_list], ['key-one', 'key-two'])
        self.assertEqual([c.kwargs['timeout'] for c in post.call_args_list], [12, 12])

    @patch.dict(os.environ, {'GEMINI_API_KEY': 'key-one', 'GEMINI_API_KEY2': 'key-two', 'GROQ_API_KEY': 'key-three'}, clear=True)
    @patch('services.ai_provider.requests.post')
    def test_groq_runs_only_after_both_gemini_fail(self, post):
        failed = Mock(status_code=503)
        failed.raise_for_status.side_effect = requests.HTTPError(response=failed)
        success = Mock()
        success.json.return_value = {'choices': [{'finish_reason': 'stop', 'message': {'content': '{"ok":true}'}}]}
        post.side_effect = [failed, failed, success]
        self.assertEqual(json.loads(generate_content('Public fixture')), {'ok': True})
        self.assertEqual(post.call_count, 3)
        self.assertEqual(post.call_args_list[2].kwargs['headers']['Authorization'], 'Bearer key-three')

    @patch.dict(os.environ, {'GEMINI_API_KEY': 'key-one', 'GEMINI_API_KEY2': 'key-two', 'GROQ_API_KEY': 'key-three'}, clear=True)
    @patch('services.ai_provider.requests.post')
    def test_three_failures_are_safe(self, post):
        post.side_effect = requests.ConnectionError('key-one key-two key-three')
        with self.assertRaises(AIProviderError) as error:
            generate_content('Public fixture')
        self.assertEqual(post.call_count, 3)
        self.assertIn('Gemini key 1', str(error.exception))
        self.assertIn('Gemini key 2', str(error.exception))
        self.assertIn('Groq', str(error.exception))
        self.assertNotIn('key-one', str(error.exception))

    @patch.dict(os.environ, {'GEMINI_API_KEY': 'key-one', 'GEMINI_API_KEY2': ' key-one ', 'GROQ_API_KEY': 'key-three'}, clear=True)
    @patch('services.ai_provider.requests.post')
    def test_duplicate_gemini_keys_are_tried_once(self, post):
        post.side_effect = requests.ConnectionError()
        with self.assertRaises(AIProviderError):
            generate_content('Public fixture')
        self.assertEqual(post.call_count, 2)

    @patch.dict(os.environ, {'GEMINI_API_KEY': 'key-one', 'GEMINI_API_KEY2': 'key-two'}, clear=True)
    @patch('services.gemini_client.requests.post')
    def test_vision_retries_second_gemini_key(self, post):
        failed = Mock(status_code=429)
        failed.raise_for_status.side_effect = requests.HTTPError(response=failed)
        success = Mock()
        success.json.return_value = {'candidates': [{'finishReason': 'STOP', 'content': {'parts': [{'text': '{"ok":true}'}]}}]}
        post.side_effect = [failed, success]
        self.assertEqual(json.loads(GeminiClient().generate_vision_content('Public fixture', 'dGVzdA==')), {'ok': True})
        self.assertEqual([c.kwargs['headers']['x-goog-api-key'] for c in post.call_args_list], ['key-one', 'key-two'])

    @patch.dict(os.environ, {'GEMINI_API_KEY2': ' new-test-key ', 'GEMINI_API_KEY': 'old-test-key', 'GEMINI_MODEL': 'gemini-3.5-flash-lite', 'QUIZ_GENERATION_MODEL': 'old-model'}, clear=True)
    @patch('services.ai_provider.requests.post')
    def test_text_uses_shared_key_and_model_despite_legacy_overrides(self, post):
        success = Mock()
        success.json.return_value = {'candidates': [{'finishReason': 'STOP', 'content': {'parts': [{'text': '{"ok":true}'}]}}]}
        post.return_value = success
        self.assertEqual(json.loads(generate_content('Public sample', gemini_key='old-argument-key', model='old-model')), {'ok': True})
        args, kwargs = post.call_args
        self.assertIn('/gemini-3.5-flash-lite:generateContent', args[0])
        self.assertEqual(kwargs['headers']['x-goog-api-key'], 'old-test-key')
        self.assertEqual(kwargs['json']['generationConfig']['thinkingConfig'], {'thinkingLevel': 'minimal'})
        self.assertNotIn('new-test-key', args[0])

    @patch.dict(os.environ, {'GEMINI_API_KEY2': 'new-test-key', 'GEMINI_MODEL': 'gemini-3.5-flash-lite'}, clear=True)
    @patch('services.gemini_client.requests.post')
    def test_vision_uses_the_same_configuration_and_keeps_key_in_header(self, post):
        success = Mock()
        success.json.return_value = {'candidates': [{'content': {'parts': [{'text': '{"ok":true}'}]}}]}
        post.return_value = success
        client = GeminiClient(api_key='old-key', model='old-model')
        self.assertEqual(json.loads(client.generate_vision_content('Describe the test image', 'dGVzdA==')), {'ok': True})
        args, kwargs = post.call_args
        self.assertIn('/gemini-3.5-flash-lite:generateContent', args[0])
        self.assertNotIn('new-test-key', args[0])
        self.assertEqual(kwargs['headers']['x-goog-api-key'], 'new-test-key')

    @patch.dict(os.environ, {'GEMINI_API_KEY': 'legacy-key', 'GEMINI_MODEL': ' ', 'QUIZ_GENERATION_MODEL': 'old-model'}, clear=True)
    def test_legacy_key_and_shared_default(self):
        self.assertEqual(get_gemini_api_key(), 'legacy-key')
        self.assertEqual(get_gemini_model(), 'gemini-3.5-flash-lite')

    @patch.dict(os.environ, {'GEMINI_API_KEY':'test-gemini','GROQ_API_KEY':'test-groq'})
    @patch('services.ai_provider.requests.post')
    def test_quota_falls_through_and_keys_stay_in_headers(self,post):
        failed=Mock(status_code=429)
        failed.raise_for_status.side_effect=requests.HTTPError(response=failed)
        success=Mock()
        success.json.return_value={'choices':[{'finish_reason':'stop','message':{'content':'{"ok":true}'}}]}
        post.side_effect=[failed,success]
        self.assertEqual(json.loads(generate_content('Public sample')),{'ok':True})
        self.assertEqual(post.call_count,2)
        for args,kwargs in post.call_args_list:
            self.assertNotIn('test-gemini',args[0])
            self.assertNotIn('test-groq',json.dumps(kwargs['json']))

    @patch.dict(os.environ, {'GEMINI_API_KEY':'test-gemini','GROQ_API_KEY':'test-groq'})
    @patch('services.ai_provider.requests.post')
    def test_both_fail_with_safe_error(self,post):
        post.side_effect=requests.ConnectionError('PRIVATE_KEY_SENTINEL')
        with self.assertRaises(AIProviderError) as error:
            generate_content('Request')
        self.assertNotIn('PRIVATE_KEY_SENTINEL',str(error.exception))
        self.assertEqual(post.call_count,2)

    @patch.dict(os.environ, {'GEMINI_API_KEY':'test-gemini','GROQ_API_KEY':'test-groq'})
    @patch('services.ai_provider.requests.post')
    def test_invalid_json_tries_next_provider(self,post):
        first=Mock()
        first.json.return_value={'candidates':[{'finishReason':'STOP','content':{'parts':[{'text':'{broken'}]}}]}
        second=Mock()
        second.json.return_value={'choices':[{'finish_reason':'stop','message':{'content':'{"valid":true}'}}]}
        post.side_effect=[first,second]
        self.assertEqual(json.loads(generate_content('Request')),{'valid':True})
