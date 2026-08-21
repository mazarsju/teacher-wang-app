import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock, patch

import backend.utils.database.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.app import app  # noqa: E402
from auth_stub import TEST_USER_ID, authenticated_client, patch_request_auth  # noqa: E402


class TestCompleteGrammarPointEndpoint(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)

        self.point_patcher = patch(
            "backend.routes.complete_grammar_point.GrammarPoint"
        )
        self.mock_point_cls = self.point_patcher.start()
        self.addCleanup(self.point_patcher.stop)

        self.progress_patcher = patch(
            "backend.routes.complete_grammar_point.UserGrammarProgress"
        )
        self.mock_progress_cls = self.progress_patcher.start()
        self.addCleanup(self.progress_patcher.stop)

        self.db_patcher = patch("backend.routes.complete_grammar_point.db")
        self.mock_db = self.db_patcher.start()
        self.addCleanup(self.db_patcher.stop)

    def test_creates_progress_row_when_none_exists(self):
        self.mock_point_cls.query.get.return_value = MagicMock(
            id="1|Basic Sentence Structure"
        )
        self.mock_progress_cls.query.filter_by.return_value.first.return_value = None

        response = self.client.post(
            "/grammar-points/1%7CBasic%20Sentence%20Structure/complete",
            json={"score": 82},
        )

        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        self.assertEqual(body["grammar_id"], "1|Basic Sentence Structure")
        self.assertEqual(body["status"], "DONE")
        self.assertEqual(body["score"], 82)
        self.assertIn("last_practiced_at", body)
        self.mock_progress_cls.query.filter_by.assert_called_once_with(
            user_id=TEST_USER_ID, grammar_id="1|Basic Sentence Structure"
        )
        self.mock_db.session.add.assert_called_once()
        self.mock_db.session.commit.assert_called_once()

    def test_updates_existing_progress_row(self):
        self.mock_point_cls.query.get.return_value = MagicMock(
            id="1|Basic Sentence Structure"
        )
        existing_progress = MagicMock(status="TODO", score=None)
        self.mock_progress_cls.query.filter_by.return_value.first.return_value = (
            existing_progress
        )

        response = self.client.post(
            "/grammar-points/1%7CBasic%20Sentence%20Structure/complete",
            json={"score": 82},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(existing_progress.status, "DONE")
        self.assertEqual(existing_progress.score, 82)
        self.mock_db.session.add.assert_not_called()
        self.mock_db.session.commit.assert_called_once()

    def test_marks_wip_instead_of_done_below_the_passing_score(self):
        self.mock_point_cls.query.get.return_value = MagicMock(
            id="1|Basic Sentence Structure"
        )
        existing_progress = MagicMock(status="TODO", score=None)
        self.mock_progress_cls.query.filter_by.return_value.first.return_value = (
            existing_progress
        )

        response = self.client.post(
            "/grammar-points/1%7CBasic%20Sentence%20Structure/complete",
            json={"score": 45},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["status"], "WIP")
        self.assertEqual(existing_progress.status, "WIP")
        self.assertEqual(existing_progress.score, 45)
        self.mock_db.session.commit.assert_called_once()

    def test_treats_a_score_of_exactly_80_as_passing(self):
        self.mock_point_cls.query.get.return_value = MagicMock(
            id="1|Basic Sentence Structure"
        )
        self.mock_progress_cls.query.filter_by.return_value.first.return_value = None

        response = self.client.post(
            "/grammar-points/1%7CBasic%20Sentence%20Structure/complete",
            json={"score": 80},
        )

        self.assertEqual(response.get_json()["status"], "DONE")

    def test_treats_a_score_of_79_as_wip(self):
        self.mock_point_cls.query.get.return_value = MagicMock(
            id="1|Basic Sentence Structure"
        )
        self.mock_progress_cls.query.filter_by.return_value.first.return_value = None

        response = self.client.post(
            "/grammar-points/1%7CBasic%20Sentence%20Structure/complete",
            json={"score": 79},
        )

        self.assertEqual(response.get_json()["status"], "WIP")

    def test_returns_404_when_grammar_point_does_not_exist(self):
        self.mock_point_cls.query.get.return_value = None

        response = self.client.post(
            "/grammar-points/unknown/complete", json={"score": 50}
        )

        self.assertEqual(response.status_code, 404)
        self.mock_db.session.commit.assert_not_called()

    def test_rejects_missing_score(self):
        self.mock_point_cls.query.get.return_value = MagicMock(
            id="1|Basic Sentence Structure"
        )

        response = self.client.post(
            "/grammar-points/1%7CBasic%20Sentence%20Structure/complete", json={}
        )

        self.assertEqual(response.status_code, 400)
        self.mock_db.session.commit.assert_not_called()

    def test_rejects_out_of_range_score(self):
        self.mock_point_cls.query.get.return_value = MagicMock(
            id="1|Basic Sentence Structure"
        )

        response = self.client.post(
            "/grammar-points/1%7CBasic%20Sentence%20Structure/complete",
            json={"score": 150},
        )

        self.assertEqual(response.status_code, 400)
        self.mock_db.session.commit.assert_not_called()


if __name__ == "__main__":
    unittest.main()
