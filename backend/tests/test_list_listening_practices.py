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

        self.refresh_and_list_patcher = patch(
            "backend.routes.list_listening_practices.refresh_and_list_listening_practices_for_level"
        )
        self.mock_refresh_and_list = self.refresh_and_list_patcher.start()
        self.addCleanup(self.refresh_and_list_patcher.stop)

    def test_returns_the_refreshed_listening_practices_for_one_level(self):
        self.mock_refresh_and_list.return_value = [
            {
                "id": "listening-family-size",
                "status": "TODO",
                "vocabulary_score": 0,
                "grammar_score": 0,
            }
        ]

        response = self.client.get("/listening-practices/1")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            {"listening_practices": self.mock_refresh_and_list.return_value},
        )
        self.mock_refresh_and_list.assert_called_once_with(TEST_USER_ID, 1)

    def test_scopes_to_the_requested_level(self):
        self.mock_refresh_and_list.return_value = []

        response = self.client.get("/listening-practices/3")

        self.assertEqual(response.status_code, 200)
        self.mock_refresh_and_list.assert_called_once_with(TEST_USER_ID, 3)


if __name__ == "__main__":
    unittest.main()
