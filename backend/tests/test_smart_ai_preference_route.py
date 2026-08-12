import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock, patch

import backend.utils.database.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.app import app  # noqa: E402
from auth_stub import TEST_USER_ID, authenticated_client, patch_request_auth  # noqa: E402


class TestSmartAiPreferenceEndpoint(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)
        self.get_patcher = patch(
            "backend.routes.smart_ai_preference.get_smart_ai_enabled"
        )
        self.set_patcher = patch(
            "backend.routes.smart_ai_preference.set_smart_ai_enabled"
        )
        self.mock_get = self.get_patcher.start()
        self.mock_set = self.set_patcher.start()
        self.addCleanup(self.get_patcher.stop)
        self.addCleanup(self.set_patcher.stop)

    def test_get_returns_current_preference(self):
        self.mock_get.return_value = True

        response = self.client.get("/preferences/smart-ai")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"enabled": True})
        self.mock_get.assert_called_once_with(TEST_USER_ID)

    def test_patch_updates_preference(self):
        response = self.client.patch(
            "/preferences/smart-ai", json={"enabled": False}
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"enabled": False})
        self.mock_set.assert_called_once_with(TEST_USER_ID, False, commit=True)

    def test_patch_rejects_missing_field(self):
        response = self.client.patch("/preferences/smart-ai", json={})

        self.assertEqual(response.status_code, 400)
        self.mock_set.assert_not_called()

    def test_patch_rejects_non_boolean(self):
        response = self.client.patch(
            "/preferences/smart-ai", json={"enabled": "yes"}
        )

        self.assertEqual(response.status_code, 400)
        self.mock_set.assert_not_called()


if __name__ == "__main__":
    unittest.main()
