import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock, patch

import backend.utils.database.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.app import app  # noqa: E402
from auth_stub import TEST_USER_ID, authenticated_client, patch_request_auth  # noqa: E402


class TestRefreshListeningPracticesEndpoint(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)

        self.refresh_patcher = patch(
            "backend.routes.refresh_listening_practices.refresh_listening_progress"
        )
        self.mock_refresh = self.refresh_patcher.start()
        self.addCleanup(self.refresh_patcher.stop)

    def test_refreshes_progress_for_the_current_user(self):
        self.mock_refresh.return_value = 7

        response = self.client.post("/listening-practices/refresh")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            {"message": "Listening progress refreshed", "count": 7},
        )
        self.mock_refresh.assert_called_once_with(TEST_USER_ID)


if __name__ == "__main__":
    unittest.main()
