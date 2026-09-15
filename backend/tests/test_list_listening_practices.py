import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock, patch

import backend.utils.database.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.app import app  # noqa: E402
from auth_stub import TEST_USER_ID, authenticated_client, patch_request_auth  # noqa: E402


class TestListListeningPracticesEndpoint(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)

        self.list_patcher = patch(
            "backend.routes.list_listening_practices.list_listening_practices_for_user"
        )
        self.mock_list = self.list_patcher.start()
        self.addCleanup(self.list_patcher.stop)

        self.hsk_level_patcher = patch(
            "backend.routes.list_listening_practices.get_user_hsk_level",
            return_value=2,
        )
        self.mock_hsk_level = self.hsk_level_patcher.start()
        self.addCleanup(self.hsk_level_patcher.stop)

    def test_returns_the_listening_practices_for_the_current_user(self):
        self.mock_list.return_value = [
            {
                "id": "listening-family-size",
                "title": "How many are in your family?",
                "hsk_level": 1,
                "status": "TODO",
                "vocabulary_score": 0,
                "grammar_score": 0,
            }
        ]

        response = self.client.get("/listening-practices")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            {
                "listening_practices": self.mock_list.return_value,
                "current_hsk_level": 2,
            },
        )
        self.mock_list.assert_called_once_with(TEST_USER_ID, "en")
        self.mock_hsk_level.assert_called_once_with(TEST_USER_ID)


if __name__ == "__main__":
    unittest.main()
