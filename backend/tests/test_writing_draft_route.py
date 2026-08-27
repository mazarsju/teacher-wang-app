import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock, patch

import backend.utils.database.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.app import app  # noqa: E402
from auth_stub import TEST_USER_ID, authenticated_client, patch_request_auth  # noqa: E402


class TestWritingDraftRoute(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)

        self.current_user_patcher = patch(
            "backend.routes.writing_draft.current_user",
            return_value=MagicMock(id=TEST_USER_ID),
        )
        self.current_user_patcher.start()
        self.addCleanup(self.current_user_patcher.stop)

        self.load_patcher = patch("backend.routes.writing_draft.load_draft")
        self.mock_load = self.load_patcher.start()
        self.addCleanup(self.load_patcher.stop)

        self.save_patcher = patch("backend.routes.writing_draft.save_draft")
        self.mock_save = self.save_patcher.start()
        self.addCleanup(self.save_patcher.stop)

    def test_get_returns_the_stored_draft(self):
        self.mock_load.return_value = {"draft": "我叫小明。", "archive": []}

        response = self.client.get("/writing/draft/writing-present-yourself")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"draft": "我叫小明。", "archive": []})
        self.mock_load.assert_called_once_with(TEST_USER_ID, "writing-present-yourself")

    def test_get_rejects_an_invalid_topic_id(self):
        self.mock_load.side_effect = ValueError("Invalid topic_id")

        response = self.client.get("/writing/draft/bad id")

        self.assertEqual(response.status_code, 400)

    def test_post_rejects_missing_draft(self):
        response = self.client.post(
            "/writing/draft/writing-present-yourself", json={}
        )

        self.assertEqual(response.status_code, 400)
        self.mock_save.assert_not_called()

    def test_post_rejects_non_string_draft(self):
        response = self.client.post(
            "/writing/draft/writing-present-yourself", json={"draft": 123}
        )

        self.assertEqual(response.status_code, 400)
        self.mock_save.assert_not_called()

    def test_post_saves_and_returns_the_draft(self):
        self.mock_save.return_value = {"draft": "我叫小明。", "archive": []}

        response = self.client.post(
            "/writing/draft/writing-present-yourself", json={"draft": "我叫小明。"}
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"draft": "我叫小明。", "archive": []})
        self.mock_save.assert_called_once_with(
            TEST_USER_ID, "writing-present-yourself", "我叫小明。"
        )

    def test_post_allows_saving_an_empty_draft(self):
        self.mock_save.return_value = {"draft": "", "archive": []}

        response = self.client.post(
            "/writing/draft/writing-present-yourself", json={"draft": ""}
        )

        self.assertEqual(response.status_code, 200)
        self.mock_save.assert_called_once_with(TEST_USER_ID, "writing-present-yourself", "")


if __name__ == "__main__":
    unittest.main()
