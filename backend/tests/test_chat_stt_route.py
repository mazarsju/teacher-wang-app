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
        self.mock_assert_tokens.assert_called_once()
        self.mock_record_tokens.assert_called_once()
        _, record_kwargs = self.mock_record_tokens.call_args
        self.assertEqual(record_kwargs["input_tokens"], 0)
        self.assertGreater(record_kwargs["output_tokens"], 0)

    def test_rejects_missing_audio(self):
        response = self.client.post("/chat/stt", data={}, content_type="multipart/form-data")
        self.assertEqual(response.status_code, 400)
        self.mock_assert_tokens.assert_not_called()

    def test_rejects_request_when_free_plan_token_quota_is_exhausted(self):
        from backend.utils.database.settings import FREE_PLAN_TOKEN_EXHAUSTED_MESSAGE

        self.mock_assert_tokens.side_effect = ValueError(
            FREE_PLAN_TOKEN_EXHAUSTED_MESSAGE
        )

        response = self.client.post(
            "/chat/stt",
            data={"audio": (io.BytesIO(b"fake-audio-bytes"), "recording.webm")},
            content_type="multipart/form-data",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.get_json(), {"error": FREE_PLAN_TOKEN_EXHAUSTED_MESSAGE}
        )
        self.mock_openai_client.audio.transcriptions.create.assert_not_called()
        self.mock_record_tokens.assert_not_called()

    def test_returns_500_on_openai_failure(self):
        self.mock_openai_client.audio.transcriptions.create.side_effect = Exception("boom")

        response = self.client.post(
            "/chat/stt",
            data={"audio": (io.BytesIO(b"fake-audio-bytes"), "recording.webm")},
            content_type="multipart/form-data",
        )

        self.assertEqual(response.status_code, 500)
        self.mock_record_tokens.assert_not_called()

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
