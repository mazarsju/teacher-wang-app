import bootstrap  # noqa: F401
import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from backend.challenge_progress import (
    clear_completed_task_ids,
    load_completed_task_ids,
    save_completed_task_ids,
)
import backend.challenge_progress as progress_module


class TestChallengeProgress(unittest.TestCase):
    def setUp(self):
        self.temp_dir = TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.logs_dir = Path(self.temp_dir.name)
        self.progress_patcher = patch.object(
            progress_module, "CONVERSATION_LOGS_DIR", self.logs_dir
        )
        self.progress_patcher.start()
        self.addCleanup(self.progress_patcher.stop)

    def test_save_and_load_completed_task_ids(self):
        save_completed_task_ids(
            "challenge-restaurant",
            ["call-waiter", "ask-bill", "call-waiter"],
        )
        self.assertEqual(
            load_completed_task_ids("challenge-restaurant"),
            ["call-waiter", "ask-bill"],
        )
        path = self.logs_dir / "challenge-restaurant.tasks.json"
        self.assertTrue(path.is_file())
        payload = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(
            payload,
            {"completed_task_ids": ["call-waiter", "ask-bill"]},
        )

    def test_clear_completed_task_ids(self):
        save_completed_task_ids("challenge-restaurant", ["call-waiter"])
        clear_completed_task_ids("challenge-restaurant")
        self.assertEqual(load_completed_task_ids("challenge-restaurant"), [])


if __name__ == "__main__":
    unittest.main()
