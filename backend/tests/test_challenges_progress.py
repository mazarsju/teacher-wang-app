import bootstrap  # noqa: F401
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from backend.challenge_progress import save_completed_task_ids
import backend.challenge_progress as progress_module
from backend.challenges import get_challenges_progress, is_challenge_completed


class TestChallengesProgress(unittest.TestCase):
    def setUp(self):
        self.temp_dir = TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.logs_dir = Path(self.temp_dir.name)
        self.progress_patcher = patch.object(
            progress_module, "CONVERSATION_LOGS_DIR", self.logs_dir
        )
        self.progress_patcher.start()
        self.addCleanup(self.progress_patcher.stop)

    def test_challenge_not_completed_by_default(self):
        self.assertFalse(is_challenge_completed("challenge-restaurant"))
        self.assertEqual(
            get_challenges_progress(),
            {
                "challenges": [
                    {"id": "challenge-restaurant", "completed": False},
                ]
            },
        )

    def test_challenge_completed_when_all_tasks_done(self):
        save_completed_task_ids(
            "challenge-restaurant",
            ["call-waiter", "ask-no-meat", "ask-bill", "pay-bill"],
        )
        self.assertTrue(is_challenge_completed("challenge-restaurant"))
        self.assertEqual(
            get_challenges_progress(),
            {
                "challenges": [
                    {"id": "challenge-restaurant", "completed": True},
                ]
            },
        )


if __name__ == "__main__":
    unittest.main()
