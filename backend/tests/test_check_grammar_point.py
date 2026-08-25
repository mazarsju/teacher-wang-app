import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock, patch

import backend.utils.database.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.app import app  # noqa: E402
from auth_stub import TEST_USER_ID, authenticated_client, patch_request_auth  # noqa: E402


class TestCheckGrammarPointEndpoint(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)

        self.user = MagicMock(id=TEST_USER_ID, plan="paid", shortid=42)
        self.current_user_patcher = patch(
            "backend.routes.check_grammar_point.current_user",
            return_value=self.user,
        )
        self.current_user_patcher.start()
        self.addCleanup(self.current_user_patcher.stop)

        self.db_patcher = patch("backend.routes.check_grammar_point.db")
        self.mock_db = self.db_patcher.start()
        self.addCleanup(self.db_patcher.stop)

        self.check_usage_patcher = patch(
            "backend.routes.check_grammar_point.check_grammar_usage"
        )
        self.mock_check_usage = self.check_usage_patcher.start()
        self.addCleanup(self.check_usage_patcher.stop)

    def _set_query_rows(self, rows):
        query_chain = self.mock_db.session.query.return_value
        query_chain.join.return_value.filter.return_value.all.return_value = rows

    def test_returns_empty_for_free_plan_without_calling_llm(self):
        self.user.plan = "free"

        response = self.client.post("/grammar-points/check", json={"text": "我吃饭了"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            {"grammar_points_covered": [], "new_grammar_points_mastered": []},
        )
        self.mock_check_usage.assert_not_called()

    def test_rejects_missing_text(self):
        response = self.client.post("/grammar-points/check", json={})

        self.assertEqual(response.status_code, 400)
        self.mock_check_usage.assert_not_called()

    def test_returns_empty_when_no_done_grammar_points(self):
        self._set_query_rows([])

        response = self.client.post("/grammar-points/check", json={"text": "我吃饭了"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            {"grammar_points_covered": [], "new_grammar_points_mastered": []},
        )
        self.mock_check_usage.assert_not_called()

    def test_increments_usage_and_returns_covered_titles(self):
        progress = MagicMock(grammar_id="g1", usage_in_real_life=None, status="DONE")
        self._set_query_rows([(progress, "Ba construction")])
        self.mock_check_usage.return_value = MagicMock(covered_grammar_ids=["g1"])

        response = self.client.post("/grammar-points/check", json={"text": "我把书放下了"})

        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        self.assertEqual(body["grammar_points_covered"], ["Ba construction"])
        self.assertEqual(body["new_grammar_points_mastered"], [])
        self.assertEqual(progress.usage_in_real_life, 1)
        self.assertEqual(progress.status, "DONE")
        self.mock_db.session.commit.assert_called_once()

    def test_marks_mastered_after_third_usage(self):
        progress = MagicMock(grammar_id="g1", usage_in_real_life=2, status="DONE")
        self._set_query_rows([(progress, "Ba construction")])
        self.mock_check_usage.return_value = MagicMock(covered_grammar_ids=["g1"])

        response = self.client.post("/grammar-points/check", json={"text": "我把书放下了"})

        body = response.get_json()
        self.assertEqual(body["grammar_points_covered"], ["Ba construction"])
        self.assertEqual(body["new_grammar_points_mastered"], ["Ba construction"])
        self.assertEqual(progress.usage_in_real_life, 3)
        self.assertEqual(progress.status, "MASTERED")

    def test_uncovered_grammar_points_are_not_incremented(self):
        progress = MagicMock(grammar_id="g1", usage_in_real_life=1, status="DONE")
        self._set_query_rows([(progress, "Ba construction")])
        self.mock_check_usage.return_value = MagicMock(covered_grammar_ids=[])

        response = self.client.post("/grammar-points/check", json={"text": "你好"})

        body = response.get_json()
        self.assertEqual(body["grammar_points_covered"], [])
        self.assertEqual(body["new_grammar_points_mastered"], [])
        self.assertEqual(progress.usage_in_real_life, 1)


if __name__ == "__main__":
    unittest.main()
