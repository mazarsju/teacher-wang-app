import bootstrap  # noqa: F401
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from backend.challenge_progress import save_completed_task_ids
from backend.challenges import get_challenges_progress, is_challenge_completed
from backend.conversation_log_storage import (
    LocalConversationLogStorage,
    reset_storage_for_tests,
)

TEST_USER = "user-a"


class TestChallengesProgress(unittest.TestCase):
    def setUp(self):
        self.temp_dir = TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.logs_dir = Path(self.temp_dir.name)
        reset_storage_for_tests(LocalConversationLogStorage(self.logs_dir))
        self.addCleanup(reset_storage_for_tests)

    def test_challenge_not_completed_by_default(self):
        self.assertFalse(is_challenge_completed(TEST_USER, "challenge-restaurant"))
        self.assertEqual(
            get_challenges_progress(TEST_USER),
            {
                "challenges": [
                    {"id": "challenge-restaurant", "completed": False},
                ]
            },
        )

    def test_challenge_completed_when_all_tasks_done(self):
        save_completed_task_ids(
            TEST_USER,
            "challenge-restaurant",
            ["call-waiter", "ask-no-meat", "ask-bill", "pay-bill"],
        )
        self.assertTrue(is_challenge_completed(TEST_USER, "challenge-restaurant"))
        self.assertEqual(
            get_challenges_progress(TEST_USER),
            {
                "challenges": [
                    {"id": "challenge-restaurant", "completed": True},
                ]
            },
        )


if __name__ == "__main__":
    unittest.main()
