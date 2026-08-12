import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock, patch

import backend.utils.database.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.app import app  # noqa: E402
from auth_stub import authenticated_client, patch_request_auth  # noqa: E402


class TestReloadHskContentEndpoint(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)

        self.current_user_patcher = patch(
            "backend.routes.reload_hsk_content.current_user"
        )
        self.mock_current_user = self.current_user_patcher.start()
        self.mock_current_user.return_value = MagicMock(email="mazarsju@gmail.com")
        self.addCleanup(self.current_user_patcher.stop)

        self.reload_patcher = patch(
            "backend.routes.reload_hsk_content.reload_hsk_content"
        )
        self.mock_reload = self.reload_patcher.start()
        self.addCleanup(self.reload_patcher.stop)

    def test_admin_triggers_reload(self):
        self.mock_reload.return_value = {"hsk-1": 150}

        response = self.client.post("/admin/hsk/reload")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            {"message": "HSK content reloaded", "counts": {"hsk-1": 150}},
        )
        self.mock_reload.assert_called_once_with()

    def test_non_admin_is_forbidden(self):
        self.mock_current_user.return_value = MagicMock(email="someone@example.com")

        response = self.client.post("/admin/hsk/reload")

        self.assertEqual(response.status_code, 403)
        self.mock_reload.assert_not_called()


if __name__ == "__main__":
    unittest.main()
