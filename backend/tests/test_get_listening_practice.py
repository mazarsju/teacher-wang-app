import bootstrap  # noqa: F401
import json
import unittest
from unittest.mock import MagicMock, patch

import backend.utils.database.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.app import app  # noqa: E402
from auth_stub import TEST_USER_ID, authenticated_client, patch_request_auth  # noqa: E402


class TestGetListeningPracticeEndpoint(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)

        self.current_user_patcher = patch(
            "backend.routes.get_listening_practice.current_user",
            return_value=MagicMock(id=TEST_USER_ID, language="en"),
        )
        self.current_user_patcher.start()
        self.addCleanup(self.current_user_patcher.stop)

        self.practice_patcher = patch(
            "backend.routes.get_listening_practice.ListeningPractice"
        )
        self.mock_practice_cls = self.practice_patcher.start()
        self.addCleanup(self.practice_patcher.stop)

        self.progress_patcher = patch(
            "backend.routes.get_listening_practice.ListeningProgress"
        )
        self.mock_progress_cls = self.progress_patcher.start()
        self.mock_progress_cls.query.filter_by.return_value.first.return_value = None
        self.addCleanup(self.progress_patcher.stop)

        self.text_patcher = patch(
            "backend.routes.get_listening_practice.fetch_listening_text",
            return_value="你家有几个人？",
        )
        self.mock_text = self.text_patcher.start()
        self.addCleanup(self.text_patcher.stop)

        self.breakdown_patcher = patch(
            "backend.routes.get_listening_practice.fetch_listening_breakdown",
            return_value=[{"id": 1, "mandarin": "你家有几个人？", "translation": "..."}],
        )
        self.mock_breakdown = self.breakdown_patcher.start()
        self.addCleanup(self.breakdown_patcher.stop)

        self.segments_patcher = patch(
            "backend.routes.get_listening_practice.list_listening_audio_segments",
            return_value=[1, 2, 3],
        )
        self.mock_segments = self.segments_patcher.start()
        self.addCleanup(self.segments_patcher.stop)

        self.exercises_patcher = patch(
            "backend.routes.get_listening_practice.fetch_listening_exercises",
            return_value=[
                {
                    "id": "mcq_001",
                    "type": "multiple_choice",
                    "question": "How many?",
                    "choices": ["3", "5"],
                    "answer": 1,
                }
            ],
        )
        self.mock_exercises = self.exercises_patcher.start()
        self.addCleanup(self.exercises_patcher.stop)

        self.speaker_names_patcher = patch(
            "backend.routes.get_listening_practice.fetch_listening_speaker_names",
            return_value={},
        )
        self.mock_speaker_names = self.speaker_names_patcher.start()
        self.addCleanup(self.speaker_names_patcher.stop)

    def _stub_topic(self):
        self.mock_practice_cls.query.get.return_value = MagicMock(
            id="listening-family-size",
            title="Family size",
            hsk_level=1,
            type="dialog",
        )

    def test_returns_topic_detail_with_default_progress(self):
        self._stub_topic()

        response = self.client.get("/listening-practices/listening-family-size")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            {
                "id": "listening-family-size",
                "title": "Family size",
                "hsk_level": 1,
                "type": "dialog",
                "man_name": None,
                "woman_name": None,
                "status": "TODO",
                "vocabulary_score": 0,
                "grammar_score": 0,
                "text": "你家有几个人？",
                "sentences": [
                    {"id": 1, "mandarin": "你家有几个人？", "translation": "..."}
                ],
                "exercises": [
                    {
                        "id": "mcq_001",
                        "type": "multiple_choice",
                        "question": "How many?",
                        "choices": ["3", "5"],
                        "answer": 1,
                    }
                ],
                "bonus_question": None,
                "progress": None,
                "segment_count": 3,
            },
        )
        self.mock_breakdown.assert_called_once_with(
            1, "listening-family-size", "en"
        )
        self.mock_exercises.assert_called_once_with(
            1, "listening-family-size", "en"
        )

    def test_splits_the_open_question_out_of_exercises_into_bonus_question(self):
        self._stub_topic()
        self.mock_exercises.return_value = [
            {
                "id": "mcq_001",
                "type": "multiple_choice",
                "question": "How many?",
                "choices": ["3", "5"],
                "answer": 1,
            },
            {
                "id": "open_001",
                "type": "open_question",
                "question": "Describe your family.",
            },
        ]

        response = self.client.get("/listening-practices/listening-family-size")

        body = response.get_json()
        self.assertEqual(
            body["exercises"],
            [
                {
                    "id": "mcq_001",
                    "type": "multiple_choice",
                    "question": "How many?",
                    "choices": ["3", "5"],
                    "answer": 1,
                }
            ],
        )
        self.assertEqual(body["bonus_question"], "Describe your family.")

    def test_returns_existing_progress(self):
        self._stub_topic()
        self.mock_progress_cls.query.filter_by.return_value.first.return_value = (
            MagicMock(
                status="DONE", vocabulary_score=80, grammar_score=60, progress=None
            )
        )

        response = self.client.get("/listening-practices/listening-family-size")

        body = response.get_json()
        self.assertEqual(body["status"], "DONE")
        self.assertEqual(body["vocabulary_score"], 80)
        self.assertEqual(body["grammar_score"], 60)
        self.assertIsNone(body["progress"])

    def test_returns_the_saved_answer_progress_parsed_as_json(self):
        self._stub_topic()
        saved = {
            "exercises": {"mcq_001": 1},
            "shadowing": {"1": {"text": "你家有几个人？", "result": "correct"}},
            "bonus": None,
        }
        self.mock_progress_cls.query.filter_by.return_value.first.return_value = (
            MagicMock(
                status="TODO",
                vocabulary_score=0,
                grammar_score=0,
                progress=json.dumps(saved),
            )
        )

        response = self.client.get("/listening-practices/listening-family-size")

        self.assertEqual(response.get_json()["progress"], saved)

    def test_returns_speaker_names_when_present_in_overview_yaml(self):
        self._stub_topic()
        self.mock_speaker_names.return_value = {
            "manName": "大卫",
            "womanName": "小美",
        }

        response = self.client.get("/listening-practices/listening-family-size")

        body = response.get_json()
        self.assertEqual(body["man_name"], "大卫")
        self.assertEqual(body["woman_name"], "小美")

    def test_returns_404_for_unknown_topic(self):
        self.mock_practice_cls.query.get.return_value = None

        response = self.client.get("/listening-practices/does-not-exist")

        self.assertEqual(response.status_code, 404)


class TestGetListeningPracticeAudioEndpoints(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)

        self.practice_patcher = patch(
            "backend.routes.get_listening_practice.ListeningPractice"
        )
        self.mock_practice_cls = self.practice_patcher.start()
        self.addCleanup(self.practice_patcher.stop)
        self.mock_practice_cls.query.get.return_value = MagicMock(
            id="listening-family-size", title="Family size", hsk_level=1
        )

        self.read_audio_patcher = patch(
            "backend.routes.get_listening_practice.read_listening_audio"
        )
        self.mock_read_audio = self.read_audio_patcher.start()
        self.addCleanup(self.read_audio_patcher.stop)

        self.read_segment_patcher = patch(
            "backend.routes.get_listening_practice.read_listening_audio_segment"
        )
        self.mock_read_segment = self.read_segment_patcher.start()
        self.addCleanup(self.read_segment_patcher.stop)

    def test_returns_full_audio_bytes(self):
        self.mock_read_audio.return_value = b"fake-mp3-bytes"

        response = self.client.get("/listening-practices/listening-family-size/audio")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, b"fake-mp3-bytes")
        self.assertEqual(response.mimetype, "audio/mpeg")
        self.mock_read_audio.assert_called_once_with(1, "listening-family-size")

    def test_returns_404_when_full_audio_missing(self):
        self.mock_read_audio.return_value = None

        response = self.client.get("/listening-practices/listening-family-size/audio")

        self.assertEqual(response.status_code, 404)

    def test_returns_segment_audio_bytes(self):
        self.mock_read_segment.return_value = b"segment-bytes"

        response = self.client.get(
            "/listening-practices/listening-family-size/audio/2"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, b"segment-bytes")
        self.assertEqual(response.mimetype, "audio/mpeg")
        self.mock_read_segment.assert_called_once_with(
            1, "listening-family-size", 2, chunk=None
        )

    def test_returns_404_when_segment_missing(self):
        self.mock_read_segment.return_value = None

        response = self.client.get(
            "/listening-practices/listening-family-size/audio/9"
        )

        self.assertEqual(response.status_code, 404)

    def test_returns_chunk_audio_bytes(self):
        self.mock_read_segment.return_value = b"chunk-bytes"

        response = self.client.get(
            "/listening-practices/listening-family-size/audio/2/3"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, b"chunk-bytes")
        self.assertEqual(response.mimetype, "audio/mpeg")
        self.mock_read_segment.assert_called_once_with(
            1, "listening-family-size", 2, chunk=3
        )

    def test_returns_404_when_chunk_missing(self):
        self.mock_read_segment.return_value = None

        response = self.client.get(
            "/listening-practices/listening-family-size/audio/2/9"
        )

        self.assertEqual(response.status_code, 404)

    def test_returns_404_for_unknown_topic_audio(self):
        self.mock_practice_cls.query.get.return_value = None

        response = self.client.get("/listening-practices/does-not-exist/audio")

        self.assertEqual(response.status_code, 404)


if __name__ == "__main__":
    unittest.main()
