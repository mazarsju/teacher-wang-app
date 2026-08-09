import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock, patch

import backend.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.app import app  # noqa: E402
from backend.cognito_admin import CognitoAdminError  # noqa: E402
from auth_stub import authenticated_client, patch_request_auth  # noqa: E402


class TestDeleteUserEndpoint(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)

        self.current_user_patcher = patch("backend.routes.delete_user.current_user")
        self.mock_current_user = self.current_user_patcher.start()
        self.mock_current_user.return_value = MagicMock(email="mazarsju@gmail.com")
        self.addCleanup(self.current_user_patcher.stop)

        self.user_cls_patcher = patch("backend.routes.delete_user.User")
        self.mock_user_cls = self.user_cls_patcher.start()
        self.addCleanup(self.user_cls_patcher.stop)

        self.session_patcher = patch("backend.routes.delete_user.db.session")
        self.mock_session = self.session_patcher.start()
        self.addCleanup(self.session_patcher.stop)

        self.delete_cognito_user_patcher = patch(
            "backend.routes.delete_user.delete_cognito_user"
        )
        self.mock_delete_cognito_user = self.delete_cognito_user_patcher.start()
        self.addCleanup(self.delete_cognito_user_patcher.stop)

        self.storage_patcher = patch("backend.routes.delete_user.get_storage")
        self.mock_get_storage = self.storage_patcher.start()
        self.addCleanup(self.storage_patcher.stop)
        self.mock_storage = MagicMock()
        self.mock_get_storage.return_value = self.mock_storage

        for name in (
            "Character",
            "Word",
            "Setting",
            "IgnoreVocabCard",
            "IgnoreWritingCard",
            "IgnoreHskWord",
            "ChallengeProgress",
            "TokenCount",
        ):
            patcher = patch(f"backend.routes.delete_user.{name}")
            mock_cls = patcher.start()
            self.addCleanup(patcher.stop)
            setattr(self, f"mock_{name}", mock_cls)

    def _target(self, shortid=1, sub="target-sub", email="a@example.com"):
        target = MagicMock(shortid=shortid, id=sub, email=email)
        self.mock_user_cls.query.filter_by.return_value.first.return_value = target
        return target

    def test_deletes_data_cognito_account_and_user_row(self):
        target = self._target()

        response = self.client.delete("/admin/users/1")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"message": "User deleted"})

        self.mock_delete_cognito_user.assert_called_once_with(target.id)
        for name in (
            "Character",
            "Word",
            "Setting",
            "IgnoreVocabCard",
            "IgnoreWritingCard",
            "IgnoreHskWord",
            "ChallengeProgress",
            "TokenCount",
        ):
            mock_cls = getattr(self, f"mock_{name}")
            mock_cls.query.filter_by.assert_called_once_with(user_id=target.shortid)

        self.mock_storage.delete_prefix.assert_called_once_with(f"users/{target.id}/")
        self.mock_session.delete.assert_called_once_with(target)
        self.mock_session.commit.assert_called_once()

    def test_missing_user_returns_not_found(self):
        self.mock_user_cls.query.filter_by.return_value.first.return_value = None

        response = self.client.delete("/admin/users/99")

        self.assertEqual(response.status_code, 404)
        self.mock_delete_cognito_user.assert_not_called()

    def test_cannot_delete_admin_account(self):
        self._target(email="mazarsju@gmail.com")

        response = self.client.delete("/admin/users/1")

        self.assertEqual(response.status_code, 400)
        self.mock_delete_cognito_user.assert_not_called()
        self.mock_session.delete.assert_not_called()

    def test_cognito_failure_aborts_before_touching_database(self):
        self._target()
        self.mock_delete_cognito_user.side_effect = CognitoAdminError("boom")

        response = self.client.delete("/admin/users/1")

        self.assertEqual(response.status_code, 502)
        self.mock_session.delete.assert_not_called()
        self.mock_session.commit.assert_not_called()

    def test_non_admin_is_forbidden(self):
        self.mock_current_user.return_value = MagicMock(email="someone@example.com")

        response = self.client.delete("/admin/users/1")

        self.assertEqual(response.status_code, 403)
        self.mock_user_cls.query.filter_by.assert_not_called()


if __name__ == "__main__":
    unittest.main()
