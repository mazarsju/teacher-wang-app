import bootstrap  # noqa: F401
import io
import unittest
from unittest.mock import MagicMock, patch

import backend.utils.database.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.app import app  # noqa: E402
from auth_stub import authenticated_client, patch_request_auth  # noqa: E402


class TestChatSttEndpoint(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)

        self.client_patcher = patch("backend.routes.chat.get_openai_client")
        self.mock_get_client = self.client_patcher.start()
        self.addCleanup(self.client_patcher.stop)

        self.mock_openai_client = MagicMock()
        self.mock_get_client.return_value = self.mock_openai_client
        self.mock_openai_client.audio.transcriptions.create.return_value = MagicMock(
            text="你好"
        )

    def test_returns_transcribed_text_using_mandarin_language_hint(self):
        response = self.client.post(
            "/chat/stt",
            data={"audio": (io.BytesIO(b"fake-audio-bytes"), "recording.webm")},
            content_type="multipart/form-data",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"text": "你好"})
        _, kwargs = self.mock_openai_client.audio.transcriptions.create.call_args
        self.assertEqual(kwargs["model"], "whisper-1")
        self.assertEqual(kwargs["language"], "zh")
        self.assertEqual(kwargs["file"][0], "recording.webm")

    def test_rejects_missing_audio(self):
        response = self.client.post("/chat/stt", data={}, content_type="multipart/form-data")
        self.assertEqual(response.status_code, 400)

    def test_returns_500_on_openai_failure(self):
        self.mock_openai_client.audio.transcriptions.create.side_effect = Exception("boom")

        response = self.client.post(
            "/chat/stt",
            data={"audio": (io.BytesIO(b"fake-audio-bytes"), "recording.webm")},
            content_type="multipart/form-data",
        )

        self.assertEqual(response.status_code, 500)

    def test_requires_authentication(self):
        anonymous_client = app.test_client()
        response = anonymous_client.post(
            "/chat/stt",
            data={"audio": (io.BytesIO(b"fake-audio-bytes"), "recording.webm")},
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 401)


if __name__ == "__main__":
    unittest.main()
