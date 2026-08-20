import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock, patch

import backend.utils.database.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.app import app  # noqa: E402
from auth_stub import TEST_USER_ID, authenticated_client, patch_request_auth  # noqa: E402


class TestSkipGrammarPointEndpoint(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)

        self.point_patcher = patch(
            "backend.routes.skip_grammar_point.GrammarPoint"
        )
        self.mock_point_cls = self.point_patcher.start()
        self.addCleanup(self.point_patcher.stop)

        self.progress_patcher = patch(
            "backend.routes.skip_grammar_point.UserGrammarProgress"
        )
        self.mock_progress_cls = self.progress_patcher.start()
        self.addCleanup(self.progress_patcher.stop)

        self.db_patcher = patch("backend.routes.skip_grammar_point.db")
        self.mock_db = self.db_patcher.start()
        self.addCleanup(self.db_patcher.stop)

    def test_creates_progress_row_when_none_exists(self):
        self.mock_point_cls.query.get.return_value = MagicMock(
            id="1|Basic Sentence Structure"
        )
        self.mock_progress_cls.query.filter_by.return_value.first.return_value = None

        response = self.client.post(
            "/grammar-points/1%7CBasic%20Sentence%20Structure/skip"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            {"grammar_id": "1|Basic Sentence Structure", "status": "SKIP"},
        )
        self.mock_progress_cls.query.filter_by.assert_called_once_with(
            user_id=TEST_USER_ID, grammar_id="1|Basic Sentence Structure"
        )
        self.mock_db.session.add.assert_called_once()
        self.mock_db.session.commit.assert_called_once()

    def test_updates_existing_progress_row(self):
        self.mock_point_cls.query.get.return_value = MagicMock(
            id="1|Basic Sentence Structure"
        )
        existing_progress = MagicMock(status="TODO")
        self.mock_progress_cls.query.filter_by.return_value.first.return_value = (
            existing_progress
        )

        response = self.client.post(
            "/grammar-points/1%7CBasic%20Sentence%20Structure/skip"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(existing_progress.status, "SKIP")
        self.mock_db.session.add.assert_not_called()
        self.mock_db.session.commit.assert_called_once()

    def test_returns_404_when_grammar_point_does_not_exist(self):
        self.mock_point_cls.query.get.return_value = None

        response = self.client.post("/grammar-points/unknown/skip")

        self.assertEqual(response.status_code, 404)
        self.mock_db.session.commit.assert_not_called()


if __name__ == "__main__":
    unittest.main()
