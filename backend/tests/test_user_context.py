import bootstrap  # noqa: F401
import unittest
from unittest.mock import patch

from flask import g

from backend.auth import AuthError
from backend.models import Setting, User
from backend.user_context import (
    ID_TOKEN_HEADER,
    current_user,
    current_user_id,
    ensure_current_user,
)
from postgres_test_case import PostgresTestCase

COGNITO_SUB = "cognito-sub-1"
ACCESS_CLAIMS = {
    "sub": COGNITO_SUB,
    "username": "wang",
    "token_use": "access",
    "client_id": "test-client",
}


class TestEnsureCurrentUser(PostgresTestCase):
    def _request(self, headers: dict[str, str] | None = None):
        return self.app.test_request_context(headers=headers or {})

    def test_creates_user_with_placeholder_email_and_default_settings(self):
        with self._request():
            g.cognito_claims = ACCESS_CLAIMS
            g.cognito_sub = COGNITO_SUB

            user = ensure_current_user()

            self.assertEqual(user.id, COGNITO_SUB)
            self.assertEqual(user.username, "wang")
            self.assertEqual(user.email, f"{COGNITO_SUB}@users.local")
            self.assertEqual(user.plan, "free")
            self.assertEqual(current_user_id(), COGNITO_SUB)
            self.assertEqual(current_user().id, COGNITO_SUB)

        self.assertGreater(Setting.query.filter_by(user_id=COGNITO_SUB).count(), 0)

    def test_uses_email_from_verified_id_token(self):
        with self._request({ID_TOKEN_HEADER: "id.token.value"}):
            g.cognito_claims = ACCESS_CLAIMS
            g.cognito_sub = COGNITO_SUB

            with patch(
                "backend.user_context.verify_id_token",
                return_value={"sub": COGNITO_SUB, "email": "wang@example.com"},
            ):
                user = ensure_current_user()

        self.assertEqual(user.email, "wang@example.com")

    def test_ignores_id_token_for_another_subject(self):
        with self._request({ID_TOKEN_HEADER: "id.token.value"}):
            g.cognito_claims = ACCESS_CLAIMS
            g.cognito_sub = COGNITO_SUB

            with patch(
                "backend.user_context.verify_id_token",
                return_value={"sub": "someone-else", "email": "other@example.com"},
            ):
                user = ensure_current_user()

        self.assertEqual(user.email, f"{COGNITO_SUB}@users.local")

    def test_ignores_unverifiable_id_token(self):
        with self._request({ID_TOKEN_HEADER: "broken"}):
            g.cognito_claims = ACCESS_CLAIMS
            g.cognito_sub = COGNITO_SUB

            with patch(
                "backend.user_context.verify_id_token",
                side_effect=AuthError("invalid token"),
            ):
                user = ensure_current_user()

        self.assertEqual(user.email, f"{COGNITO_SUB}@users.local")

    def test_second_request_refreshes_last_connexion_without_duplicating(self):
        with self._request():
            g.cognito_claims = ACCESS_CLAIMS
            g.cognito_sub = COGNITO_SUB
            first_seen = ensure_current_user().last_connexion

        with self._request():
            g.cognito_claims = ACCESS_CLAIMS
            g.cognito_sub = COGNITO_SUB
            second_seen = ensure_current_user().last_connexion

        self.assertEqual(User.query.filter_by(id=COGNITO_SUB).count(), 1)
        self.assertGreaterEqual(second_seen, first_seen)

    def test_falls_back_to_sub_when_username_claim_is_missing(self):
        with self._request():
            g.cognito_claims = {"sub": COGNITO_SUB, "token_use": "access"}
            g.cognito_sub = COGNITO_SUB

            user = ensure_current_user()

        self.assertEqual(user.username, COGNITO_SUB)


class TestCurrentUserId(PostgresTestCase):
    def test_raises_outside_an_authenticated_request(self):
        with self.app.test_request_context():
            with self.assertRaises(RuntimeError):
                current_user_id()

    def test_current_user_raises_when_row_disappeared(self):
        with self.app.test_request_context():
            g.current_user_id = "ghost-user"
            with self.assertRaises(RuntimeError):
                current_user()


if __name__ == "__main__":
    unittest.main()
