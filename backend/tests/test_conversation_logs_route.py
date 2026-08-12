import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock, patch

import backend.utils.database.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.app import app  # noqa: E402
from auth_stub import (  # noqa: E402
    TEST_USER_ID,
    authenticated_client,
    patch_request_auth,
)


class TestConversationLogsRoute(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)

        self.load_patcher = patch(
            "backend.routes.conversation_logs.load_conversation"
        )
        self.mock_load = self.load_patcher.start()
        self.addCleanup(self.load_patcher.stop)

        self.exists_patcher = patch(
            "backend.routes.conversation_logs.conversation_exists"
        )
        self.mock_exists = self.exists_patcher.start()
        self.addCleanup(self.exists_patcher.stop)

        self.create_patcher = patch(
            "backend.routes.conversation_logs.create_conversation"
        )
        self.mock_create = self.create_patcher.start()
        self.addCleanup(self.create_patcher.stop)

        self.replace_patcher = patch(
            "backend.routes.conversation_logs.replace_conversation"
        )
        self.mock_replace = self.replace_patcher.start()
        self.addCleanup(self.replace_patcher.stop)

        self.clear_patcher = patch(
            "backend.routes.conversation_logs.clear_conversation"
        )
        self.mock_clear = self.clear_patcher.start()
        self.addCleanup(self.clear_patcher.stop)

        self.load_tasks_patcher = patch(
            "backend.routes.conversation_logs.load_completed_task_ids"
        )
        self.mock_load_tasks = self.load_tasks_patcher.start()
        self.addCleanup(self.load_tasks_patcher.stop)

        self.clear_tasks_patcher = patch(
            "backend.routes.conversation_logs.clear_completed_task_ids"
        )
        self.mock_clear_tasks = self.clear_tasks_patcher.start()
        self.addCleanup(self.clear_tasks_patcher.stop)

        self.clear_progress_patcher = patch(
            "backend.routes.conversation_logs.clear_challenge_progress"
        )
        self.mock_clear_progress = self.clear_progress_patcher.start()
        self.addCleanup(self.clear_progress_patcher.stop)

        self.mock_load.return_value = []
        self.mock_load_tasks.return_value = []
        self.mock_exists.return_value = False

    def test_get_conversation_log(self):
        self.mock_load.return_value = [{"role": "user", "content": "Hello"}]

        response = self.client.get("/conversation-logs/teacher-wang")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            {"messages": [{"role": "user", "content": "Hello"}]},
        )
        self.mock_load.assert_called_once_with(TEST_USER_ID, "teacher-wang")

    def test_post_creates_empty_log(self):
        response = self.client.post("/conversation-logs/teacher-wang")

        self.assertEqual(response.status_code, 201)
        self.mock_create.assert_called_once_with(TEST_USER_ID, "teacher-wang")

    def test_post_conflict_when_exists(self):
        self.mock_exists.return_value = True

        response = self.client.post("/conversation-logs/teacher-wang")

        self.assertEqual(response.status_code, 409)
        self.mock_create.assert_not_called()

    def test_patch_replaces_messages(self):
        messages = [{"role": "user", "content": "Hi"}]
        self.mock_load.return_value = messages

        response = self.client.patch(
            "/conversation-logs/teacher-wang",
            json={"messages": messages},
        )

        self.assertEqual(response.status_code, 200)
        self.mock_replace.assert_called_once_with(
            TEST_USER_ID,
            "teacher-wang",
            messages,
        )

    def test_delete_clears_log_and_challenge_progress(self):
        response = self.client.delete("/conversation-logs/challenge-restaurant")

        self.assertEqual(response.status_code, 200)
        self.mock_clear.assert_called_once_with(
            TEST_USER_ID,
            "challenge-restaurant",
        )
        self.mock_clear_tasks.assert_called_once_with(
            TEST_USER_ID,
            "challenge-restaurant",
        )
        self.mock_clear_progress.assert_called_once_with(
            TEST_USER_ID,
            "challenge-restaurant",
        )


if __name__ == "__main__":
    unittest.main()
