import json
import os
import unittest
from unittest.mock import patch, Mock
import requests
from services.ai_provider import generate_content, AIProviderError
from services.ai_config import get_gemini_api_key, get_gemini_model
from services.gemini_client import GeminiClient


class ProviderTests(unittest.TestCase):
    def _make_failed(self, status=429):
        m = Mock(status_code=status)
        m.raise_for_status.side_effect = requests.HTTPError(response=m)
        return m

    def _make_success(self, payload):
        m = Mock()
        m.json.return_value = payload
        return m

    def test_second_gemini_key_recovers_without_groq(self):
        env = {'GEMINI_API_KEY': 'key-one', 'GEMINI_API_KEY2': 'key-two', 'GROQ_API_KEY': 'key-three'}
        with patch.dict(os.environ, env, clear=True):
            with patch('services.ai_provider.requests.post') as post:
                post.side_effect = [self._make_failed(429), self._make_success({'candidates': [{'finishReason': 'STOP', 'content': {'parts': [{'text': '{"ok":true}'}]}}]})]
                self.assertEqual(json.loads(generate_content('Public fixture')), {'ok': True})
                self.assertEqual([c.kwargs['headers']['x-goog-api-key'] for c in post.call_args_list], ['key-one', 'key-two'])
                self.assertEqual([c.kwargs['timeout'] for c in post.call_args_list], [12, 12])

    def test_groq_runs_only_after_both_gemini_fail(self):
        env = {'GEMINI_API_KEY': 'key-one', 'GEMINI_API_KEY2': 'key-two', 'GROQ_API_KEY': 'key-three'}
        with patch.dict(os.environ, env, clear=True):
            with patch('services.ai_provider.requests.post') as post:
                post.side_effect = [self._make_failed(503), self._make_failed(503), self._make_success({'choices': [{'finish_reason': 'stop', 'message': {'content': '{"ok":true}'}}]})]
                self.assertEqual(json.loads(generate_content('Public fixture')), {'ok': True})
                self.assertEqual(post.call_count, 3)
                self.assertEqual(post.call_args_list[2].kwargs['headers']['Authorization'], 'Bearer key-three')

    def test_three_failures_are_safe(self):
        env = {'GEMINI_API_KEY': 'key-one', 'GEMINI_API_KEY2': 'key-two', 'GROQ_API_KEY': 'key-three'}
        with patch.dict(os.environ, env, clear=True):
            with patch('services.ai_provider.requests.post') as post:
                post.side_effect = requests.ConnectionError('key-one key-two key-three')
                with self.assertRaises(AIProviderError) as error:
                    generate_content('Public fixture')
                self.assertEqual(post.call_count, 3)
                self.assertIn('Gemini key 1', str(error.exception))
                self.assertIn('Gemini key 2', str(error.exception))
                self.assertIn('Groq', str(error.exception))
                self.assertNotIn('key-one', str(error.exception))

    def test_duplicate_gemini_keys_are_tried_once(self):
        env = {'GEMINI_API_KEY': 'key-one', 'GEMINI_API_KEY2': ' key-one ', 'GROQ_API_KEY': 'key-three'}
        with patch.dict(os.environ, env, clear=True):
            with patch('services.ai_provider.requests.post') as post:
                post.side_effect = requests.ConnectionError()
                with self.assertRaises(AIProviderError):
                    generate_content('Public fixture')
                self.assertEqual(post.call_count, 2)

    def test_vision_retries_second_gemini_key(self):
        env = {'GEMINI_API_KEY': 'key-one', 'GEMINI_API_KEY2': 'key-two'}
        with patch.dict(os.environ, env, clear=True):
            with patch('services.gemini_client.requests.post') as post:
                post.side_effect = [self._make_failed(429), self._make_success({'candidates': [{'finishReason': 'STOP', 'content': {'parts': [{'text': '{"ok":true}'}]}}]})]
                self.assertEqual(json.loads(GeminiClient().generate_vision_content('Public fixture', 'dGVzdA==')), {'ok': True})
                self.assertEqual([c.kwargs['headers']['x-goog-api-key'] for c in post.call_args_list], ['key-one', 'key-two'])

    def test_text_uses_shared_key_and_model_despite_legacy_overrides(self):
        env = {'GEMINI_API_KEY2': ' new-test-key ', 'GEMINI_API_KEY': 'old-test-key', 'GEMINI_MODEL': 'gemini-3.5-flash-lite', 'QUIZ_GENERATION_MODEL': 'old-model'}
        with patch.dict(os.environ, env, clear=True):
            with patch('services.ai_provider.requests.post') as post:
                post.return_value = self._make_success({'candidates': [{'finishReason': 'STOP', 'content': {'parts': [{'text': '{"ok":true}'}]}}]})
                self.assertEqual(json.loads(generate_content('Public sample', gemini_key='old-argument-key', model='old-model')), {'ok': True})
                args, kwargs = post.call_args
                self.assertIn('/gemini-3.5-flash-lite:generateContent', args[0])
                self.assertEqual(kwargs['headers']['x-goog-api-key'], 'old-test-key')
                self.assertEqual(kwargs['json']['generationConfig']['thinkingConfig'], {'thinkingLevel': 'minimal'})
                self.assertNotIn('new-test-key', args[0])

    def test_vision_uses_the_same_configuration_and_keeps_key_in_header(self):
        env = {'GEMINI_API_KEY2': 'new-test-key', 'GEMINI_MODEL': 'gemini-3.5-flash-lite'}
        with patch.dict(os.environ, env, clear=True):
            with patch('services.gemini_client.requests.post') as post:
                post.return_value = self._make_success({'candidates': [{'content': {'parts': [{'text': '{"ok":true}'}]}}]})
                client = GeminiClient(api_key='old-key', model='old-model')
                self.assertEqual(json.loads(client.generate_vision_content('Describe the test image', 'dGVzdA==')), {'ok': True})
                args, kwargs = post.call_args
                self.assertIn('/gemini-3.5-flash-lite:generateContent', args[0])
                self.assertNotIn('new-test-key', args[0])
                self.assertEqual(kwargs['headers']['x-goog-api-key'], 'new-test-key')

    def test_legacy_key_and_shared_default(self):
        env = {'GEMINI_API_KEY': 'legacy-key', 'GEMINI_MODEL': ' ', 'QUIZ_GENERATION_MODEL': 'old-model'}
        with patch.dict(os.environ, env, clear=True):
            self.assertEqual(get_gemini_api_key(), 'legacy-key')
            self.assertEqual(get_gemini_model(), 'gemini-3.5-flash-lite')

    def test_quota_falls_through_and_keys_stay_in_headers(self):
        env = {'GEMINI_API_KEY': 'test-gemini', 'GROQ_API_KEY': 'test-groq'}
        with patch.dict(os.environ, env, clear=True):
            with patch('services.ai_provider.requests.post') as post:
                post.side_effect = [self._make_failed(429), self._make_success({'choices': [{'finish_reason': 'stop', 'message': {'content': '{"ok":true}'}}]})]
                self.assertEqual(json.loads(generate_content('Public sample')), {'ok': True})
                self.assertEqual(post.call_count, 2)
                for args, kwargs in post.call_args_list:
                    self.assertNotIn('test-gemini', args[0])
                    self.assertNotIn('test-groq', json.dumps(kwargs['json']))

    def test_both_fail_with_safe_error(self):
        env = {'GEMINI_API_KEY': 'test-gemini', 'GROQ_API_KEY': 'test-groq'}
        with patch.dict(os.environ, env, clear=True):
            with patch('services.ai_provider.requests.post') as post:
                post.side_effect = requests.ConnectionError('PRIVATE_KEY_SENTINEL')
                with self.assertRaises(AIProviderError) as error:
                    generate_content('Request')
                self.assertNotIn('PRIVATE_KEY_SENTINEL', str(error.exception))
                self.assertEqual(post.call_count, 2)

    def test_invalid_json_tries_next_provider(self):
        env = {'GEMINI_API_KEY': 'test-gemini', 'GROQ_API_KEY': 'test-groq'}
        with patch.dict(os.environ, env, clear=True):
            with patch('services.ai_provider.requests.post') as post:
                first = self._make_success({'candidates': [{'finishReason': 'STOP', 'content': {'parts': [{'text': '{broken'}]}}]})
                second = self._make_success({'choices': [{'finish_reason': 'stop', 'message': {'content': '{"valid":true}'}}]})
                post.side_effect = [first, second]
                self.assertEqual(json.loads(generate_content('Request')), {'valid': True})
