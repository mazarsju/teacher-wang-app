import bootstrap  # noqa: F401
import json
import unittest
from unittest.mock import MagicMock, patch

import backend.utils.database.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.app import app  # noqa: E402
from auth_stub import TEST_USER_ID, authenticated_client, patch_request_auth  # noqa: E402


class TestSaveListeningProgressEndpoint(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)

        self.practice_patcher = patch(
            "backend.routes.save_listening_progress.ListeningPractice"
        )
        self.mock_practice_cls = self.practice_patcher.start()
        self.addCleanup(self.practice_patcher.stop)
        self.mock_practice_cls.query.get.return_value = MagicMock(
            id="listening-family-size"
        )

        self.progress_patcher = patch(
            "backend.routes.save_listening_progress.ListeningProgress"
        )
        self.mock_progress_cls = self.progress_patcher.start()
        self.addCleanup(self.progress_patcher.stop)

        self.db_patcher = patch("backend.routes.save_listening_progress.db")
        self.mock_db = self.db_patcher.start()
        self.addCleanup(self.db_patcher.stop)

    def test_creates_progress_row_when_none_exists(self):
        self.mock_progress_cls.query.filter_by.return_value.first.return_value = None
        created = MagicMock()
        self.mock_progress_cls.return_value = created
        progress = {"exercises": {"mcq_001": 1}, "shadowing": {}, "bonus": None}

        response = self.client.post(
            "/listening-practices/listening-family-size/progress",
            json={"progress": progress},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"progress": progress})
        self.mock_progress_cls.query.filter_by.assert_called_once_with(
            user_id=TEST_USER_ID, listening_topic="listening-family-size"
        )
        self.mock_db.session.add.assert_called_once_with(created)
        self.assertEqual(json.loads(created.progress), progress)
        self.mock_db.session.commit.assert_called_once()

    def test_overwrites_progress_on_an_existing_row(self):
        existing = MagicMock(progress=json.dumps({"exercises": {}}))
        self.mock_progress_cls.query.filter_by.return_value.first.return_value = (
            existing
        )
        progress = {"exercises": {"mcq_001": 0}, "shadowing": {}, "bonus": None}

        response = self.client.post(
            "/listening-practices/listening-family-size/progress",
            json={"progress": progress},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(json.loads(existing.progress), progress)
        self.mock_db.session.add.assert_not_called()
        self.mock_db.session.commit.assert_called_once()

    def test_returns_404_when_topic_does_not_exist(self):
        self.mock_practice_cls.query.get.return_value = None

        response = self.client.post(
            "/listening-practices/does-not-exist/progress",
            json={"progress": {}},
        )

        self.assertEqual(response.status_code, 404)
        self.mock_db.session.commit.assert_not_called()

    def test_rejects_missing_progress(self):
        response = self.client.post(
            "/listening-practices/listening-family-size/progress", json={}
        )

        self.assertEqual(response.status_code, 400)
        self.mock_db.session.commit.assert_not_called()

    def test_rejects_non_object_progress(self):
        response = self.client.post(
            "/listening-practices/listening-family-size/progress",
            json={"progress": "not-an-object"},
        )

        self.assertEqual(response.status_code, 400)
        self.mock_db.session.commit.assert_not_called()


if __name__ == "__main__":
    unittest.main()
