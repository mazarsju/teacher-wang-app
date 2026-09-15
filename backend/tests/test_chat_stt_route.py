import bootstrap  # noqa: F401
import io
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import backend.utils.database.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.app import app  # noqa: E402
from auth_stub import authenticated_client, patch_request_auth  # noqa: E402


def _segment(text, no_speech_prob=0.05, avg_logprob=-0.2):
    return SimpleNamespace(text=text, no_speech_prob=no_speech_prob, avg_logprob=avg_logprob)


def _transcript(text, segments=None):
    return SimpleNamespace(text=text, segments=segments)


class TestChatSttEndpoint(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)

        self.client_patcher = patch("backend.routes.chat.get_openai_client")
        self.mock_get_client = self.client_patcher.start()
        self.addCleanup(self.client_patcher.stop)

        self.mock_openai_client = MagicMock()
        self.mock_get_client.return_value = self.mock_openai_client
        self.mock_openai_client.audio.transcriptions.create.return_value = _transcript(
            "你好", segments=[_segment("你好")]
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
        self.assertEqual(kwargs["response_format"], "verbose_json")
        self.assertEqual(kwargs["file"][0], "recording.webm")
        self.mock_assert_tokens.assert_called_once()
        self.mock_record_tokens.assert_called_once()
        _, record_kwargs = self.mock_record_tokens.call_args
        self.assertEqual(record_kwargs["input_tokens"], 0)
        self.assertGreater(record_kwargs["output_tokens"], 0)

    def test_keeps_digits_alongside_chinese_characters(self):
        text = "我今年20岁, room #208"
        self.mock_openai_client.audio.transcriptions.create.return_value = _transcript(
            text, segments=[_segment(text)]
        )

        response = self.client.post(
            "/chat/stt",
            data={"audio": (io.BytesIO(b"fake-audio-bytes"), "recording.webm")},
            content_type="multipart/form-data",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"text": "我今年20岁208"})

    def test_keeps_chinese_punctuation(self):
        text = "我的家有5口。有爸爸妈妈哥哥和妹妹。"
        self.mock_openai_client.audio.transcriptions.create.return_value = _transcript(
            text, segments=[_segment(text)]
        )

        response = self.client.post(
            "/chat/stt",
            data={"audio": (io.BytesIO(b"fake-audio-bytes"), "recording.webm")},
            content_type="multipart/form-data",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"text": text})

    def test_drops_halfwidth_punctuation_attached_to_non_chinese_text(self):
        # Half-width punctuation (as opposed to the full-width forms Whisper
        # uses for real Mandarin speech) is only ever seen glued to stray
        # Latin text, so it's dropped along with that text rather than kept.
        text = "Hello, 你好! How are you 吗?"
        self.mock_openai_client.audio.transcriptions.create.return_value = _transcript(
            text, segments=[_segment(text)]
        )

        response = self.client.post(
            "/chat/stt",
            data={"audio": (io.BytesIO(b"fake-audio-bytes"), "recording.webm")},
            content_type="multipart/form-data",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"text": "你好吗"})

    def test_returns_empty_text_when_no_chinese_characters_detected(self):
        text = "Hello there, how are you?"
        self.mock_openai_client.audio.transcriptions.create.return_value = _transcript(
            text, segments=[_segment(text)]
        )

        response = self.client.post(
            "/chat/stt",
            data={"audio": (io.BytesIO(b"fake-audio-bytes"), "recording.webm")},
            content_type="multipart/form-data",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"text": ""})

    def test_drops_hallucinated_text_when_audio_is_silent(self):
        # Whisper's classic silence hallucination: a memorized subtitle-credit
        # line instead of empty text, flagged by a high no_speech_prob and a
        # low avg_logprob on its (only) segment.
        text = "由社群提供的字幕"
        self.mock_openai_client.audio.transcriptions.create.return_value = _transcript(
            text, segments=[_segment(text, no_speech_prob=0.95, avg_logprob=-1.5)]
        )

        response = self.client.post(
            "/chat/stt",
            data={"audio": (io.BytesIO(b"fake-audio-bytes"), "recording.webm")},
            content_type="multipart/form-data",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"text": ""})

    def test_drops_only_the_hallucinated_trailing_segment(self):
        self.mock_openai_client.audio.transcriptions.create.return_value = _transcript(
            "你家有几个人？由社群提供的字幕",
            segments=[
                _segment("你家有几个人？", no_speech_prob=0.05, avg_logprob=-0.2),
                _segment("由社群提供的字幕", no_speech_prob=0.95, avg_logprob=-1.5),
            ],
        )

        response = self.client.post(
            "/chat/stt",
            data={"audio": (io.BytesIO(b"fake-audio-bytes"), "recording.webm")},
            content_type="multipart/form-data",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"text": "你家有几个人？"})

    def test_keeps_a_quiet_but_confidently_transcribed_segment(self):
        # A high no_speech_prob alone shouldn't drop real speech Whisper was
        # still confident about (a quiet utterance) — both signals must agree.
        self.mock_openai_client.audio.transcriptions.create.return_value = _transcript(
            "你好", segments=[_segment("你好", no_speech_prob=0.8, avg_logprob=-0.3)]
        )

        response = self.client.post(
            "/chat/stt",
            data={"audio": (io.BytesIO(b"fake-audio-bytes"), "recording.webm")},
            content_type="multipart/form-data",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"text": "你好"})

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
