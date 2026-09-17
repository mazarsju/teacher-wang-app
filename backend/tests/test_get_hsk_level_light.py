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


class TestGetHskLevelLightEndpoint(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)
        self.level_patcher = patch(
            "backend.routes.get_hsk_level_light.get_stored_current_hsk_level"
        )
        self.mock_get_level = self.level_patcher.start()
        self.addCleanup(self.level_patcher.stop)

    def test_get_hsk_level_light_returns_stored_level(self):
        self.mock_get_level.return_value = 3

        response = self.client.get("/hsk-level-light")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"current_level": 3})
        self.mock_get_level.assert_called_once_with(TEST_USER_ID)

    def test_get_hsk_level_light_returns_null_when_never_computed(self):
        self.mock_get_level.return_value = None

        response = self.client.get("/hsk-level-light")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"current_level": None})


if __name__ == "__main__":
    unittest.main()
