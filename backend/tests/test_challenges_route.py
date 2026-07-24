import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock, patch

import backend.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.app import app  # noqa: E402


class TestChallengesProgressEndpoint(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
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
