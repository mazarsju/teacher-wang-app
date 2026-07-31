import bootstrap  # noqa: F401
import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from backend.challenge_progress import (
    clear_completed_task_ids,
    load_completed_task_ids,
    save_completed_task_ids,
)
from backend.conversation_log_storage import (
    LocalConversationLogStorage,
    reset_storage_for_tests,
)

TEST_USER = "user-a"


class TestChallengeProgress(unittest.TestCase):
    def setUp(self):
        self.temp_dir = TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.logs_dir = Path(self.temp_dir.name)
        reset_storage_for_tests(LocalConversationLogStorage(self.logs_dir))
        self.addCleanup(reset_storage_for_tests)

    def test_save_and_load_completed_task_ids(self):
        save_completed_task_ids(
            TEST_USER,
            "challenge-restaurant",
            ["call-waiter", "ask-bill", "call-waiter"],
        )
        self.assertEqual(
            load_completed_task_ids(TEST_USER, "challenge-restaurant"),
            ["call-waiter", "ask-bill"],
        )
        path = (
            self.logs_dir / "users" / TEST_USER / "challenge-restaurant.tasks.json"
        )
        self.assertTrue(path.is_file())
        payload = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(
            payload,
            {"completed_task_ids": ["call-waiter", "ask-bill"]},
        )

    def test_clear_completed_task_ids(self):
        save_completed_task_ids(TEST_USER, "challenge-restaurant", ["call-waiter"])
        clear_completed_task_ids(TEST_USER, "challenge-restaurant")
        self.assertEqual(
            load_completed_task_ids(TEST_USER, "challenge-restaurant"),
            [],
        )


if __name__ == "__main__":
    unittest.main()
