import bootstrap  # noqa: F401
import json
import unittest
from unittest.mock import MagicMock, patch

from backend.utils.aiChat import elevenlabs_client


class TestElevenLabsClient(unittest.TestCase):
    def test_generate_speech_calls_the_right_voice_id_and_clamps_speed(self):
        mock_response = MagicMock()
        mock_response.read.return_value = b"fake-audio-bytes"
        mock_response.__enter__.return_value = mock_response

        with (
            patch(
                "backend.utils.aiChat.elevenlabs_client.read_config_value",
                return_value="test-key",
            ),
            patch(
                "backend.utils.aiChat.elevenlabs_client.urlopen",
                return_value=mock_response,
            ) as mock_urlopen,
        ):
            result = elevenlabs_client.generate_speech("sarah", "你好", 2.0)

        self.assertEqual(result, b"fake-audio-bytes")
        request = mock_urlopen.call_args[0][0]
        self.assertIn(
            elevenlabs_client.ELEVENLABS_VOICE_IDS["sarah"], request.full_url
        )
        self.assertEqual(request.headers["Xi-api-key"], "test-key")
        body = json.loads(request.data)
        self.assertEqual(body["text"], "你好")
        self.assertEqual(body["model_id"], elevenlabs_client.ELEVENLABS_MODEL_ID)
        # Speed is clamped to ElevenLabs' accepted range.
        self.assertEqual(body["voice_settings"]["speed"], elevenlabs_client.MAX_SPEED)

    def test_voice_ids_are_unique(self):
        ids = list(elevenlabs_client.ELEVENLABS_VOICE_IDS.values())
        self.assertEqual(len(ids), len(set(ids)))

    def test_generate_speech_rejects_unknown_voice(self):
        with self.assertRaises(ValueError):
            elevenlabs_client.generate_speech("not-a-real-voice", "你好", 1.0)

    def test_generate_speech_requires_api_key(self):
        with patch(
            "backend.utils.aiChat.elevenlabs_client.read_config_value",
            return_value="",
        ):
            with self.assertRaises(ValueError):
                elevenlabs_client.generate_speech("sarah", "你好", 1.0)


if __name__ == "__main__":
    unittest.main()
