import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock, patch

import backend.utils.database.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.app import app  # noqa: E402
from auth_stub import authenticated_client, patch_request_auth  # noqa: E402


class TestLanguagePreferenceEndpoint(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)

        self.current_user_patcher = patch(
            "backend.routes.language_preference.current_user"
        )
        self.mock_current_user = self.current_user_patcher.start()
        self.user = MagicMock(language="en")
        self.mock_current_user.return_value = self.user
        self.addCleanup(self.current_user_patcher.stop)

        self.session_patcher = patch("backend.routes.language_preference.db.session")
        self.mock_session = self.session_patcher.start()
        self.addCleanup(self.session_patcher.stop)

    def test_patch_updates_language(self):
        response = self.client.patch(
            "/preferences/language", json={"language": "fr"}
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"language": "fr"})
        self.assertEqual(self.user.language, "fr")
        self.mock_session.commit.assert_called_once()

    def test_patch_rejects_missing_field(self):
        response = self.client.patch("/preferences/language", json={})

        self.assertEqual(response.status_code, 400)
        self.mock_session.commit.assert_not_called()

    def test_patch_rejects_unsupported_language(self):
        response = self.client.patch(
            "/preferences/language", json={"language": "de"}
        )

        self.assertEqual(response.status_code, 400)
        self.mock_session.commit.assert_not_called()


if __name__ == "__main__":
    unittest.main()
