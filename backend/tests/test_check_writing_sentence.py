import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock, patch

import backend.utils.database.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.app import app  # noqa: E402
from auth_stub import authenticated_client, patch_request_auth  # noqa: E402


class TestCheckWritingSentenceEndpoint(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)

        self.current_user_id_patcher = patch(
            "backend.routes.check_writing_sentence.current_user_id",
            return_value=42,
        )
        self.current_user_id_patcher.start()
        self.addCleanup(self.current_user_id_patcher.stop)

        self.check_grammar_patcher = patch(
            "backend.routes.check_writing_sentence.check_user_grammar"
        )
        self.mock_check_grammar = self.check_grammar_patcher.start()
        self.addCleanup(self.check_grammar_patcher.stop)

    def test_rejects_missing_text(self):
        response = self.client.post("/writing/check-sentence", json={})

        self.assertEqual(response.status_code, 400)
        self.mock_check_grammar.assert_not_called()

    def test_rejects_blank_text(self):
        response = self.client.post("/writing/check-sentence", json={"text": "   "})

        self.assertEqual(response.status_code, 400)
        self.mock_check_grammar.assert_not_called()

    def test_returns_none_severity_without_answer(self):
        self.mock_check_grammar.return_value = MagicMock(
            to_dict=lambda: {"severity": "none"}
        )

        response = self.client.post("/writing/check-sentence", json={"text": "我叫小明。"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"severity": "none"})
        self.mock_check_grammar.assert_called_once_with(42, "我叫小明。")

    def test_returns_severity_and_answer_when_incorrect(self):
        self.mock_check_grammar.return_value = MagicMock(
            to_dict=lambda: {
                "severity": "incorrect",
                "answer": "Missing a measure word before 书.",
            }
        )

        response = self.client.post("/writing/check-sentence", json={"text": "我买书。"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            {"severity": "incorrect", "answer": "Missing a measure word before 书."},
        )

    def test_returns_400_when_service_raises_value_error(self):
        self.mock_check_grammar.side_effect = ValueError("Not enough tokens left.")

        response = self.client.post("/writing/check-sentence", json={"text": "你好"})

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json(), {"error": "Not enough tokens left."})

    def test_returns_500_on_unexpected_error(self):
        self.mock_check_grammar.side_effect = RuntimeError("boom")

        response = self.client.post("/writing/check-sentence", json={"text": "你好"})

        self.assertEqual(response.status_code, 500)
        self.assertEqual(
            response.get_json(), {"error": "Failed to check the sentence's grammar"}
        )


if __name__ == "__main__":
    unittest.main()
