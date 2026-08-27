import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock, patch

import backend.utils.database.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.app import app  # noqa: E402
from auth_stub import authenticated_client, patch_request_auth  # noqa: E402


class TestCheckWritingTopicRelevanceEndpoint(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)

        self.check_patcher = patch(
            "backend.routes.check_writing_topic_relevance.check_writing_topic_relevance"
        )
        self.mock_check = self.check_patcher.start()
        self.addCleanup(self.check_patcher.stop)

    def test_rejects_missing_text(self):
        response = self.client.post(
            "/writing/check-topic-relevance", json={"topic": "Present yourself"}
        )

        self.assertEqual(response.status_code, 400)
        self.mock_check.assert_not_called()

    def test_rejects_blank_text(self):
        response = self.client.post(
            "/writing/check-topic-relevance",
            json={"text": "   ", "topic": "Present yourself"},
        )

        self.assertEqual(response.status_code, 400)
        self.mock_check.assert_not_called()

    def test_rejects_missing_topic(self):
        response = self.client.post(
            "/writing/check-topic-relevance", json={"text": "我是学生。"}
        )

        self.assertEqual(response.status_code, 400)
        self.mock_check.assert_not_called()

    def test_returns_on_topic_true(self):
        self.mock_check.return_value = MagicMock(on_topic=True)

        response = self.client.post(
            "/writing/check-topic-relevance",
            json={"text": "我叫小明。", "topic": "Present yourself"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"on_topic": True})
        self.mock_check.assert_called_once_with("我叫小明。", "Present yourself")

    def test_returns_on_topic_false(self):
        self.mock_check.return_value = MagicMock(on_topic=False)

        response = self.client.post(
            "/writing/check-topic-relevance",
            json={"text": "你好！", "topic": "Present yourself"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"on_topic": False})

    def test_returns_400_when_service_raises_value_error(self):
        self.mock_check.side_effect = ValueError("Not enough tokens left.")

        response = self.client.post(
            "/writing/check-topic-relevance",
            json={"text": "你好", "topic": "Present yourself"},
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json(), {"error": "Not enough tokens left."})

    def test_returns_500_on_unexpected_error(self):
        self.mock_check.side_effect = RuntimeError("boom")

        response = self.client.post(
            "/writing/check-topic-relevance",
            json={"text": "你好", "topic": "Present yourself"},
        )

        self.assertEqual(response.status_code, 500)
        self.assertEqual(
            response.get_json(),
            {"error": "Failed to check whether the text answers the topic"},
        )


if __name__ == "__main__":
    unittest.main()
