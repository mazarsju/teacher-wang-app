import bootstrap  # noqa: F401
import unittest

from backend.challenge_progress import has_completed_challenge, mark_challenge_completed
from backend.challenges import get_challenges_progress
from postgres_test_case import PostgresTestCase

ALL_CHALLENGE_IDS = (
    "challenge-restaurant",
    "challenge-taxi",
    "challenge-hotel",
    "challenge-shop",
    "challenge-new-friend",
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


class TestChallengesProgress(PostgresTestCase):
    def test_challenge_not_completed_by_default(self):
        for challenge_id in ALL_CHALLENGE_IDS:
            self.assertFalse(has_completed_challenge(self.user_id, challenge_id))
        self.assertEqual(get_challenges_progress(self.user_id), progress_payload())

    def test_challenge_completed_once_marked(self):
        mark_challenge_completed(self.user_id, "challenge-restaurant")

        self.assertTrue(has_completed_challenge(self.user_id, "challenge-restaurant"))
        self.assertEqual(
            get_challenges_progress(self.user_id),
            progress_payload(**{"challenge-restaurant": True}),
        )

    def test_marking_completed_twice_is_idempotent(self):
        mark_challenge_completed(self.user_id, "challenge-new-friend")
        mark_challenge_completed(self.user_id, "challenge-new-friend")

        self.assertTrue(has_completed_challenge(self.user_id, "challenge-new-friend"))

    def test_non_challenge_character_is_never_marked_completed(self):
        mark_challenge_completed(self.user_id, "teacher-wang")

        self.assertFalse(has_completed_challenge(self.user_id, "teacher-wang"))


if __name__ == "__main__":
    unittest.main()
