import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock, patch

import backend.utils.database.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.app import app  # noqa: E402
from auth_stub import TEST_USER_ID, authenticated_client, patch_request_auth  # noqa: E402


class TestWritingPracticeEndpoint(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)

        self.current_user_patcher = patch(
            "backend.routes.writing_practice.current_user",
            return_value=MagicMock(id=TEST_USER_ID),
        )
        self.current_user_patcher.start()
        self.addCleanup(self.current_user_patcher.stop)

        self.practice_patcher = patch("backend.routes.writing_practice.WritingPractice")
        self.mock_practice_cls = self.practice_patcher.start()
        self.addCleanup(self.practice_patcher.stop)

        self.fetch_content_patcher = patch(
            "backend.routes.writing_practice.fetch_writing_practice_content"
        )
        self.mock_fetch_content = self.fetch_content_patcher.start()
        self.addCleanup(self.fetch_content_patcher.stop)

        self.load_patcher = patch("backend.routes.writing_practice.load_draft")
        self.mock_load = self.load_patcher.start()
        self.addCleanup(self.load_patcher.stop)

        self.save_patcher = patch("backend.routes.writing_practice.save_draft")
        self.mock_save = self.save_patcher.start()
        self.addCleanup(self.save_patcher.stop)

        self.complete_patcher = patch("backend.routes.writing_practice.complete_draft")
        self.mock_complete = self.complete_patcher.start()
        self.addCleanup(self.complete_patcher.stop)

    def _stub_practice(self, title="Present yourself"):
        self.mock_practice_cls.query.get.return_value = MagicMock(
            id="writing-present-yourself", title=title
        )

    def test_get_returns_title_context_draft_and_archive(self):
        self._stub_practice()
        self.mock_fetch_content.return_value = {"context": "Write about yourself."}
        self.mock_load.return_value = {"draft": "我叫小明。", "archive": []}

        response = self.client.get("/writing-practice/writing-present-yourself")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            {
                "title": "Present yourself",
                "context": "Write about yourself.",
                "draft": "我叫小明。",
                "archive": [],
            },
        )
        self.mock_practice_cls.query.get.assert_called_once_with(
            "writing-present-yourself"
        )
        self.mock_fetch_content.assert_called_once_with("writing-present-yourself")
        self.mock_load.assert_called_once_with(TEST_USER_ID, "writing-present-yourself")

    def test_get_returns_null_context_when_missing(self):
        self._stub_practice()
        self.mock_fetch_content.return_value = {"context": None}
        self.mock_load.return_value = {"draft": "", "archive": []}

        response = self.client.get("/writing-practice/writing-present-yourself")

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.get_json()["context"])

    def test_get_returns_404_when_topic_not_found(self):
        self.mock_practice_cls.query.get.return_value = None

        response = self.client.get("/writing-practice/does-not-exist")

        self.assertEqual(response.status_code, 404)
        self.mock_fetch_content.assert_not_called()
        self.mock_load.assert_not_called()

    def test_get_rejects_an_invalid_topic_id(self):
        self._stub_practice()
        self.mock_fetch_content.return_value = {"context": None}
        self.mock_load.side_effect = ValueError("Invalid topic_id")

        response = self.client.get("/writing-practice/writing-present-yourself")

        self.assertEqual(response.status_code, 400)

    def test_post_rejects_missing_draft(self):
        response = self.client.post(
            "/writing-practice/writing-present-yourself", json={}
        )

        self.assertEqual(response.status_code, 400)
        self.mock_save.assert_not_called()

    def test_post_rejects_non_string_draft(self):
        response = self.client.post(
            "/writing-practice/writing-present-yourself", json={"draft": 123}
        )

        self.assertEqual(response.status_code, 400)
        self.mock_save.assert_not_called()

    def test_post_saves_and_returns_the_draft(self):
        self.mock_save.return_value = {"draft": "我叫小明。", "archive": []}

        response = self.client.post(
            "/writing-practice/writing-present-yourself", json={"draft": "我叫小明。"}
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"draft": "我叫小明。", "archive": []})
        self.mock_save.assert_called_once_with(
            TEST_USER_ID, "writing-present-yourself", "我叫小明。"
        )

    def test_post_allows_saving_an_empty_draft(self):
        self.mock_save.return_value = {"draft": "", "archive": []}

        response = self.client.post(
            "/writing-practice/writing-present-yourself", json={"draft": ""}
        )

        self.assertEqual(response.status_code, 200)
        self.mock_save.assert_called_once_with(TEST_USER_ID, "writing-present-yourself", "")

    def test_post_rejects_an_invalid_topic_id(self):
        self.mock_save.side_effect = ValueError("Invalid topic_id")

        response = self.client.post(
            "/writing-practice/writing-present-yourself", json={"draft": "x"}
        )

        self.assertEqual(response.status_code, 400)

    def test_complete_rejects_missing_draft(self):
        response = self.client.post(
            "/writing-practice/writing-present-yourself/complete", json={}
        )

        self.assertEqual(response.status_code, 400)
        self.mock_complete.assert_not_called()

    def test_complete_saves_and_returns_the_archived_draft(self):
        self.mock_complete.return_value = {
            "draft": "我叫小明。",
            "archive": [{"timestamp": "t", "content": "我叫小明。"}],
        }

        response = self.client.post(
            "/writing-practice/writing-present-yourself/complete",
            json={"draft": "我叫小明。"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            {"draft": "我叫小明。", "archive": [{"timestamp": "t", "content": "我叫小明。"}]},
        )
        self.mock_complete.assert_called_once_with(
            TEST_USER_ID, "writing-present-yourself", "我叫小明。"
        )

    def test_complete_rejects_an_invalid_topic_id(self):
        self.mock_complete.side_effect = ValueError("Invalid topic_id")

        response = self.client.post(
            "/writing-practice/writing-present-yourself/complete", json={"draft": "x"}
        )

        self.assertEqual(response.status_code, 400)


if __name__ == "__main__":
    unittest.main()
