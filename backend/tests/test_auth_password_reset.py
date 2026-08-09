import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock, patch

import backend.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.app import app  # noqa: E402
from backend.cognito_public import CognitoPublicError  # noqa: E402


class TestForgotPassword(unittest.TestCase):
    def setUp(self):
        app.test_client_class = None
        self.client = app.test_client()

    def test_unknown_email_returns_generic_message_without_calling_cognito(self):
        with patch("backend.routes.auth_password_reset.User") as user_cls:
            user_cls.query.filter_by.return_value.first.return_value = None
            with patch("backend.routes.auth_password_reset.forgot_password") as cognito_call:
                response = self.client.post(
                    "/auth/forgot-password", json={"email": "ghost@example.com"}
                )
                cognito_call.assert_not_called()

        self.assertEqual(response.status_code, 200)
        self.assertIn("reset code has been sent", response.get_json()["message"])

    def test_known_email_triggers_cognito_forgot_password(self):
        user = MagicMock(username="alice", email="alice@example.com")
        with patch("backend.routes.auth_password_reset.User") as user_cls:
            user_cls.query.filter_by.return_value.first.return_value = user
            with patch("backend.routes.auth_password_reset.forgot_password") as cognito_call:
                response = self.client.post(
                    "/auth/forgot-password", json={"email": "alice@example.com"}
                )
                cognito_call.assert_called_once_with("alice")

        self.assertEqual(response.status_code, 200)

    def test_cognito_failure_is_swallowed(self):
        user = MagicMock(username="alice", email="alice@example.com")
        with patch("backend.routes.auth_password_reset.User") as user_cls:
            user_cls.query.filter_by.return_value.first.return_value = user
            with patch(
                "backend.routes.auth_password_reset.forgot_password",
                side_effect=CognitoPublicError("LimitExceeded", "boom"),
            ):
                response = self.client.post(
                    "/auth/forgot-password", json={"email": "alice@example.com"}
                )

        self.assertEqual(response.status_code, 200)

    def test_missing_email_is_rejected(self):
        response = self.client.post("/auth/forgot-password", json={})
        self.assertEqual(response.status_code, 400)

    def test_no_auth_header_required(self):
        """Password reset must be reachable without a Cognito session."""
        with patch("backend.routes.auth_password_reset.User") as user_cls:
            user_cls.query.filter_by.return_value.first.return_value = None
            response = self.client.post(
                "/auth/forgot-password", json={"email": "ghost@example.com"}
            )
        self.assertNotEqual(response.status_code, 401)


class TestConfirmPasswordReset(unittest.TestCase):
    def setUp(self):
        app.test_client_class = None
        self.client = app.test_client()

    def test_unknown_email_returns_generic_error(self):
        with patch("backend.routes.auth_password_reset.User") as user_cls:
            user_cls.query.filter_by.return_value.first.return_value = None
            response = self.client.post(
                "/auth/reset-password",
                json={"email": "ghost@example.com", "code": "123456", "newPassword": "NewPass1!"},
            )

        self.assertEqual(response.status_code, 400)

    def test_valid_code_updates_password(self):
        user = MagicMock(username="alice", email="alice@example.com")
        with patch("backend.routes.auth_password_reset.User") as user_cls:
            user_cls.query.filter_by.return_value.first.return_value = user
            with patch(
                "backend.routes.auth_password_reset.confirm_forgot_password"
            ) as cognito_call:
                response = self.client.post(
                    "/auth/reset-password",
                    json={
                        "email": "alice@example.com",
                        "code": "123456",
                        "newPassword": "NewPass1!",
                    },
                )
                cognito_call.assert_called_once_with("alice", "123456", "NewPass1!")

        self.assertEqual(response.status_code, 200)

    def test_invalid_code_surfaces_cognito_error(self):
        user = MagicMock(username="alice", email="alice@example.com")
        with patch("backend.routes.auth_password_reset.User") as user_cls:
            user_cls.query.filter_by.return_value.first.return_value = user
            with patch(
                "backend.routes.auth_password_reset.confirm_forgot_password",
                side_effect=CognitoPublicError("CodeMismatchException", "Invalid code."),
            ):
                response = self.client.post(
                    "/auth/reset-password",
                    json={
                        "email": "alice@example.com",
                        "code": "000000",
                        "newPassword": "NewPass1!",
                    },
                )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()["error"], "Invalid code.")

    def test_missing_fields_are_rejected(self):
        response = self.client.post("/auth/reset-password", json={"email": "a@b.com"})
        self.assertEqual(response.status_code, 400)


if __name__ == "__main__":
    unittest.main()
