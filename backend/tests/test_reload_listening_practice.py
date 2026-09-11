import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock, patch

import backend.utils.database.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.app import app  # noqa: E402
from auth_stub import authenticated_client, patch_request_auth  # noqa: E402


class TestReloadListeningPracticeEndpoint(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)

        self.current_user_patcher = patch(
            "backend.routes.reload_listening_practice.current_user"
        )
        self.mock_current_user = self.current_user_patcher.start()
        self.mock_current_user.return_value = MagicMock(email="mazarsju@gmail.com")
        self.addCleanup(self.current_user_patcher.stop)

        self.reload_patcher = patch(
            "backend.routes.reload_listening_practice.reload_listening_content"
        )
        self.mock_reload = self.reload_patcher.start()
        self.addCleanup(self.reload_patcher.stop)

    def test_admin_triggers_reload(self):
        self.mock_reload.return_value = {"listening_practice": 5}

        response = self.client.post("/admin/listening/reload")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            {
                "message": "Listening practice reloaded",
                "counts": {"listening_practice": 5},
            },
        )
        self.mock_reload.assert_called_once_with()

    def test_unknown_grammar_id_returns_400_with_message(self):
        self.mock_reload.side_effect = ValueError(
            "Unknown grammarId 'hsk3_adverbial_de' for 'listening_practice/hsk3/listening-sunday-mixup'"
        )

        response = self.client.post("/admin/listening/reload")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.get_json(),
            {
                "error": (
                    "Unknown grammarId 'hsk3_adverbial_de' for "
                    "'listening_practice/hsk3/listening-sunday-mixup'"
                )
            },
        )

    def test_non_admin_is_forbidden(self):
        self.mock_current_user.return_value = MagicMock(email="someone@example.com")

        response = self.client.post("/admin/listening/reload")

        self.assertEqual(response.status_code, 403)
        self.mock_reload.assert_not_called()


if __name__ == "__main__":
    unittest.main()
