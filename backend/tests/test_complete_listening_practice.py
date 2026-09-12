import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock, patch

import backend.utils.database.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.app import app  # noqa: E402
from auth_stub import TEST_USER_ID, authenticated_client, patch_request_auth  # noqa: E402


class TestCompleteListeningPracticeEndpoint(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)

        self.practice_patcher = patch(
            "backend.routes.complete_listening_practice.ListeningPractice"
        )
        self.mock_practice_cls = self.practice_patcher.start()
        self.addCleanup(self.practice_patcher.stop)
        self.mock_practice_cls.query.get.return_value = MagicMock(
            id="listening-family-size"
        )

        self.progress_patcher = patch(
            "backend.routes.complete_listening_practice.ListeningProgress"
        )
        self.mock_progress_cls = self.progress_patcher.start()
        self.addCleanup(self.progress_patcher.stop)

        self.db_patcher = patch("backend.routes.complete_listening_practice.db")
        self.mock_db = self.db_patcher.start()
        self.addCleanup(self.db_patcher.stop)

    def test_creates_progress_row_when_none_exists(self):
        self.mock_progress_cls.query.filter_by.return_value.first.return_value = None
        self.mock_progress_cls.return_value = MagicMock(
            vocabulary_score=0, grammar_score=0
        )

        response = self.client.post(
            "/listening-practices/listening-family-size/complete",
            json={"completed": True},
        )

        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        self.assertEqual(body["status"], "DONE")
        self.mock_progress_cls.query.filter_by.assert_called_once_with(
            user_id=TEST_USER_ID, listening_topic="listening-family-size"
        )
        self.mock_db.session.add.assert_called_once()
        self.mock_db.session.commit.assert_called_once()

    def test_updates_existing_progress_row_status_only(self):
        existing_progress = MagicMock(
            status="TODO", vocabulary_score=70, grammar_score=60
        )
        self.mock_progress_cls.query.filter_by.return_value.first.return_value = (
            existing_progress
        )

        response = self.client.post(
            "/listening-practices/listening-family-size/complete",
            json={"completed": True},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(existing_progress.status, "DONE")
        self.mock_db.session.add.assert_not_called()
        self.assertEqual(
            response.get_json(),
            {"status": "DONE", "vocabulary_score": 70, "grammar_score": 60},
        )

    def test_marks_wip_when_the_learner_says_not_completed(self):
        existing_progress = MagicMock(
            status="DONE", vocabulary_score=0, grammar_score=0
        )
        self.mock_progress_cls.query.filter_by.return_value.first.return_value = (
            existing_progress
        )

        response = self.client.post(
            "/listening-practices/listening-family-size/complete",
            json={"completed": False},
        )

        self.assertEqual(response.get_json()["status"], "WIP")
        self.assertEqual(existing_progress.status, "WIP")

    def test_returns_404_when_topic_does_not_exist(self):
        self.mock_practice_cls.query.get.return_value = None

        response = self.client.post(
            "/listening-practices/does-not-exist/complete", json={"completed": True}
        )

        self.assertEqual(response.status_code, 404)
        self.mock_db.session.commit.assert_not_called()

    def test_rejects_missing_completed_flag(self):
        response = self.client.post(
            "/listening-practices/listening-family-size/complete", json={}
        )

        self.assertEqual(response.status_code, 400)
        self.mock_db.session.commit.assert_not_called()

    def test_rejects_non_boolean_completed_flag(self):
        response = self.client.post(
            "/listening-practices/listening-family-size/complete",
            json={"completed": "yes"},
        )

        self.assertEqual(response.status_code, 400)
        self.mock_db.session.commit.assert_not_called()


if __name__ == "__main__":
    unittest.main()
