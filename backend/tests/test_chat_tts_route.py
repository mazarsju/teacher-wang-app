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

    def test_rejects_empty_text(self):
        response = self.client.post(
            "/chat/tts", json={"text": "  ", "voice": "alloy"}
        )
        self.assertEqual(response.status_code, 400)

    def test_rejects_missing_voice(self):
        response = self.client.post("/chat/tts", json={"text": "你好"})
        self.assertEqual(response.status_code, 400)

    def test_rejects_invalid_voice(self):
        response = self.client.post(
            "/chat/tts", json={"text": "你好", "voice": "robot"}
        )
        self.assertEqual(response.status_code, 400)

    def test_returns_500_on_openai_failure(self):
        self.mock_openai_client.audio.speech.create.side_effect = Exception("boom")
        response = self.client.post(
            "/chat/tts", json={"text": "你好", "voice": "alloy"}
        )
        self.assertEqual(response.status_code, 500)


if __name__ == "__main__":
    unittest.main()
