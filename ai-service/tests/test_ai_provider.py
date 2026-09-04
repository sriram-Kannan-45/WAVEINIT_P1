import json
import os
import unittest
from unittest.mock import patch, Mock
import requests
from services.ai_provider import generate_content, AIProviderError

class ProviderTests(unittest.TestCase):
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
