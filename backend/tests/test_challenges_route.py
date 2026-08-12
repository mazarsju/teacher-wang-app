import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock, patch

import backend.utils.database.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.app import app  # noqa: E402
from auth_stub import TEST_USER_ID, authenticated_client, patch_request_auth  # noqa: E402


class TestChallengesProgressEndpoint(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)
        self.progress_patcher = patch(
            "backend.routes.challenges.get_challenges_progress"
        )
        self.mock_progress = self.progress_patcher.start()
        self.addCleanup(self.progress_patcher.stop)

    def test_get_challenges_progress(self):
        self.mock_progress.return_value = {
            "challenges": [
                {"id": "challenge-restaurant", "completed": True},
            ]
        }

        response = self.client.get("/challenges/progress")

        self.assertEqual(response.status_code, 200)
        # challenge_progress rows are keyed by users.shortid (current_user_id()).
        self.mock_progress.assert_called_once_with(TEST_USER_ID)
        self.assertEqual(
            response.get_json(),
            {
                "challenges": [
                    {"id": "challenge-restaurant", "completed": True},
                ]
            },
        )


if __name__ == "__main__":
    unittest.main()
