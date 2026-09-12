import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock, patch

import backend.utils.database.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.app import app  # noqa: E402
from auth_stub import authenticated_client, patch_request_auth  # noqa: E402


class TestChatTtsEndpoint(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)

        self.client_patcher = patch("backend.routes.chat.get_openai_client")
        self.mock_get_client = self.client_patcher.start()
        self.addCleanup(self.client_patcher.stop)

        self.mock_openai_client = MagicMock()
        self.mock_get_client.return_value = self.mock_openai_client
        self.mock_openai_client.audio.speech.create.return_value = MagicMock(
            content=b"fake-mp3-bytes"
        )

        self.speed_patcher = patch("backend.routes.chat.get_chat_tts_speed")
        self.mock_get_speed = self.speed_patcher.start()
        self.addCleanup(self.speed_patcher.stop)
        self.mock_get_speed.return_value = 0.95

        self.adjustment_patcher = patch(
            "backend.routes.chat.get_chat_listen_speed_adjustment"
        )
        self.mock_get_adjustment = self.adjustment_patcher.start()
        self.addCleanup(self.adjustment_patcher.stop)
        self.mock_get_adjustment.return_value = 0

        self.assert_tokens_patcher = patch(
            "backend.routes.chat.assert_plan_has_tokens"
        )
        self.mock_assert_tokens = self.assert_tokens_patcher.start()
        self.addCleanup(self.assert_tokens_patcher.stop)

        self.deduct_tokens_patcher = patch("backend.routes.chat.deduct_available_token")
        self.mock_deduct_tokens = self.deduct_tokens_patcher.start()
        self.addCleanup(self.deduct_tokens_patcher.stop)

        self.record_tokens_patcher = patch("backend.routes.chat.record_token_usage")
        self.mock_record_tokens = self.record_tokens_patcher.start()
        self.addCleanup(self.record_tokens_patcher.stop)

    def test_returns_mp3_using_hsk_level_speed_and_requested_voice(self):
        response = self.client.post(
            "/chat/tts", json={"text": "你好", "voice": "nova"}
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.mimetype, "audio/mpeg")
        self.assertEqual(response.data, b"fake-mp3-bytes")
        self.mock_openai_client.audio.speech.create.assert_called_once_with(
            model="tts-1",
            voice="nova",
            input="你好",
            speed=0.95,
            response_format="mp3",
        )
        self.mock_assert_tokens.assert_called_once()
        self.mock_record_tokens.assert_called_once()
        _, kwargs = self.mock_record_tokens.call_args
        self.assertGreater(kwargs["input_tokens"], 0)
        self.assertEqual(kwargs["output_tokens"], 0)

    def test_rejects_request_when_token_quota_is_exhausted(self):
        from backend.utils.database.settings import FREE_PLAN_TOKEN_EXHAUSTED_MESSAGE

        self.mock_assert_tokens.side_effect = ValueError(
            FREE_PLAN_TOKEN_EXHAUSTED_MESSAGE
        )

        response = self.client.post(
            "/chat/tts", json={"text": "你好", "voice": "nova"}
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.get_json(), {"error": FREE_PLAN_TOKEN_EXHAUSTED_MESSAGE}
        )
        self.mock_openai_client.audio.speech.create.assert_not_called()
        self.mock_record_tokens.assert_not_called()

    def test_applies_listen_speed_adjustment_on_top_of_hsk_speed(self):
        self.mock_get_adjustment.return_value = 10

        response = self.client.post(
            "/chat/tts", json={"text": "你好", "voice": "nova"}
        )

        self.assertEqual(response.status_code, 200)
        self.mock_openai_client.audio.speech.create.assert_called_once_with(
            model="tts-1",
            voice="nova",
            input="你好",
            speed=1.05,
            response_format="mp3",
        )

    def test_rejects_empty_text(self):
        response = self.client.post(
            "/chat/tts", json={"text": "  ", "voice": "nova"}
        )
        self.assertEqual(response.status_code, 400)

    def test_rejects_missing_voice(self):
        response = self.client.post("/chat/tts", json={"text": "你好"})
        self.assertEqual(response.status_code, 400)

    def test_rejects_invalid_voice_name(self):
        response = self.client.post(
            "/chat/tts", json={"text": "你好", "voice": "robot"}
        )
        self.assertEqual(response.status_code, 400)

    def test_returns_500_on_openai_failure(self):
        self.mock_openai_client.audio.speech.create.side_effect = Exception("boom")
        response = self.client.post(
            "/chat/tts", json={"text": "你好", "voice": "nova"}
        )
        self.assertEqual(response.status_code, 500)


if __name__ == "__main__":
    unittest.main()
