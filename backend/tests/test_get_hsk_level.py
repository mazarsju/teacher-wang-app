import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock, patch

import backend.utils.database.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.app import app  # noqa: E402
from auth_stub import (  # noqa: E402
    TEST_USER_ID,
    authenticated_client,
    patch_request_auth,
)


class TestGetHskLevelEndpoint(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)
        self.status_patcher = patch("backend.routes.get_hsk_level.get_hsk_level_status")
        self.mock_status = self.status_patcher.start()
        self.addCleanup(self.status_patcher.stop)

    def test_get_hsk_level_returns_status(self):
        self.mock_status.return_value = {
            "current_level": 1,
            "next_level": 2,
            "characters_to_next_level": 3,
            "progress_to_next_level": 50.0,
            "missing_characters": ["学"],
            "max_level": 7,
            "completion_ratio": 0.85,
        }

        response = self.client.get("/hsk-level")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), self.mock_status.return_value)
        self.mock_status.assert_called_once_with(user_id=TEST_USER_ID)


if __name__ == "__main__":
    unittest.main()
