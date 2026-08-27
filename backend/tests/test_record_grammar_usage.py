import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock, patch

import backend.utils.database.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.app import app  # noqa: E402
from auth_stub import TEST_USER_ID, authenticated_client, patch_request_auth  # noqa: E402


class TestRecordGrammarUsageEndpoint(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)

        self.user = MagicMock(id=TEST_USER_ID, plan="paid", shortid=42)
        self.current_user_patcher = patch(
            "backend.routes.record_grammar_usage.current_user",
            return_value=self.user,
        )
        self.current_user_patcher.start()
        self.addCleanup(self.current_user_patcher.stop)

        self.model_patcher = patch("backend.routes.record_grammar_usage.UserGrammarProgress")
        self.mock_model_cls = self.model_patcher.start()
        self.addCleanup(self.model_patcher.stop)

        self.db_patcher = patch("backend.routes.record_grammar_usage.db")
        self.mock_db = self.db_patcher.start()
        self.addCleanup(self.db_patcher.stop)

    def _set_progress_rows(self, rows):
        self.mock_model_cls.query.filter.return_value.all.return_value = rows

    def test_returns_empty_for_free_plan_without_touching_the_database(self):
        self.user.plan = "free"

        response = self.client.post(
            "/grammar-points/record-usage", json={"grammar_ids": ["g1"]}
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"new_grammar_points_mastered": []})
        self.mock_db.session.commit.assert_not_called()

    def test_rejects_non_list_grammar_ids(self):
        response = self.client.post(
            "/grammar-points/record-usage", json={"grammar_ids": "g1"}
        )

        self.assertEqual(response.status_code, 400)

    def test_rejects_non_string_entries(self):
        response = self.client.post(
            "/grammar-points/record-usage", json={"grammar_ids": ["g1", 2]}
        )

        self.assertEqual(response.status_code, 400)

    def test_no_op_for_empty_list(self):
        response = self.client.post("/grammar-points/record-usage", json={"grammar_ids": []})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"new_grammar_points_mastered": []})
        self.mock_db.session.commit.assert_not_called()

    def test_increments_usage_once_per_occurrence(self):
        progress = MagicMock(grammar_id="g1", usage_in_real_life=0, status="DONE")
        self._set_progress_rows([progress])

        response = self.client.post(
            "/grammar-points/record-usage", json={"grammar_ids": ["g1", "g1"]}
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(progress.usage_in_real_life, 2)
        self.mock_db.session.commit.assert_called_once()

    def test_marks_mastered_at_threshold(self):
        progress = MagicMock(grammar_id="g1", usage_in_real_life=1, status="DONE")
        self._set_progress_rows([progress])

        response = self.client.post(
            "/grammar-points/record-usage", json={"grammar_ids": ["g1", "g1"]}
        )

        body = response.get_json()
        self.assertEqual(progress.usage_in_real_life, 3)
        self.assertEqual(progress.status, "MASTERED")
        self.assertEqual(body["new_grammar_points_mastered"], ["g1"])

    def test_ignores_grammar_ids_not_belonging_to_the_user(self):
        self._set_progress_rows([])

        response = self.client.post(
            "/grammar-points/record-usage", json={"grammar_ids": ["unknown"]}
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"new_grammar_points_mastered": []})

    def test_ignores_grammar_points_not_yet_done(self):
        progress = MagicMock(grammar_id="g1", usage_in_real_life=0, status="WIP")
        self._set_progress_rows([progress])

        response = self.client.post(
            "/grammar-points/record-usage", json={"grammar_ids": ["g1"]}
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(progress.usage_in_real_life, 0)

    def test_skips_already_mastered_points(self):
        progress = MagicMock(grammar_id="g1", usage_in_real_life=5, status="MASTERED")
        self._set_progress_rows([progress])

        response = self.client.post(
            "/grammar-points/record-usage", json={"grammar_ids": ["g1"]}
        )

        body = response.get_json()
        self.assertEqual(progress.usage_in_real_life, 5)
        self.assertEqual(body["new_grammar_points_mastered"], [])


if __name__ == "__main__":
    unittest.main()
