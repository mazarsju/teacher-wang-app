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

ALL_CHALLENGE_IDS = (
    "challenge-restaurant",
    "challenge-taxi",
    "challenge-hotel",
    "challenge-shop",
)


def progress_payload(**completed_ids: bool) -> dict:
    return {
        "challenges": [
            {
                "id": challenge_id,
                "completed": completed_ids.get(challenge_id, False),
            }
            for challenge_id in ALL_CHALLENGE_IDS
        ]
    }


class TestChallengesProgress(unittest.TestCase):
    def setUp(self):
        self.temp_dir = TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.logs_dir = Path(self.temp_dir.name)
        reset_storage_for_tests(LocalConversationLogStorage(self.logs_dir))
        self.addCleanup(reset_storage_for_tests)

    def test_challenge_not_completed_by_default(self):
        for challenge_id in ALL_CHALLENGE_IDS:
            self.assertFalse(is_challenge_completed(TEST_USER, challenge_id))
        self.assertEqual(get_challenges_progress(TEST_USER), progress_payload())

    def test_challenge_completed_when_all_tasks_done(self):
        save_completed_task_ids(
            TEST_USER,
            "challenge-restaurant",
            ["call-waiter", "ask-no-meat", "ask-bill", "pay-bill"],
        )
        self.assertTrue(is_challenge_completed(TEST_USER, "challenge-restaurant"))
        self.assertEqual(
            get_challenges_progress(TEST_USER),
            progress_payload(**{"challenge-restaurant": True}),
        )

    def test_taxi_challenge_completed_when_all_tasks_done(self):
        save_completed_task_ids(
            TEST_USER,
            "challenge-taxi",
            ["hail-taxi", "give-destination", "ask-fare", "pay-fare"],
        )
        self.assertTrue(is_challenge_completed(TEST_USER, "challenge-taxi"))
        self.assertEqual(
            get_challenges_progress(TEST_USER),
            progress_payload(**{"challenge-taxi": True}),
        )

    def test_hotel_challenge_completed_when_all_tasks_done(self):
        save_completed_task_ids(
            TEST_USER,
            "challenge-hotel",
            [
                "greet-receptionist",
                "check-in",
                "ask-breakfast",
                "check-out",
            ],
        )
        self.assertTrue(is_challenge_completed(TEST_USER, "challenge-hotel"))
        self.assertEqual(
            get_challenges_progress(TEST_USER),
            progress_payload(**{"challenge-hotel": True}),
        )

    def test_shop_challenge_completed_when_all_tasks_done(self):
        save_completed_task_ids(
            TEST_USER,
            "challenge-shop",
            [
                "greet-assistant",
                "ask-price",
                "ask-different-size",
                "pay-item",
            ],
        )
        self.assertTrue(is_challenge_completed(TEST_USER, "challenge-shop"))
        self.assertEqual(
            get_challenges_progress(TEST_USER),
            progress_payload(**{"challenge-shop": True}),
        )


if __name__ == "__main__":
    unittest.main()
