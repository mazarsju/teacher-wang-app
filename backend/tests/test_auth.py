import bootstrap  # noqa: F401
import time
import unittest
from unittest.mock import MagicMock, patch

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

import backend.utils.database.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from auth_stub import (  # noqa: E402
    TEST_CLAIMS,
    TEST_USER_ID,
    authenticated_client,
    patch_request_auth,
)
from backend.app import app  # noqa: E402
from backend.utils.auth.auth import AuthError, extract_bearer_token, verify_access_token
from backend.utils.auth.auth_config import CognitoConfig


def _rsa_keypair():
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    public_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    return private_pem, public_pem


class TestAuthHelpers(unittest.TestCase):
    def test_extract_bearer_token(self):
        self.assertEqual(extract_bearer_token("Bearer abc.def.ghi"), "abc.def.ghi")

    def test_extract_bearer_token_rejects_missing(self):
        with self.assertRaises(AuthError):
            extract_bearer_token(None)

    def test_verify_access_token_accepts_valid_cognito_access_token(self):
        private_pem, public_pem = _rsa_keypair()
        config = CognitoConfig(
            region="eu-west-1",
            user_pool_id="eu-west-1_Example",
            app_client_id="client123",
            issuer="https://cognito-idp.eu-west-1.amazonaws.com/eu-west-1_Example",
        )
        now = int(time.time())
        token = jwt.encode(
            {
                "sub": "user-sub-1",
                "iss": config.issuer,
                "client_id": config.app_client_id,
                "token_use": "access",
                "username": "alice",
                "exp": now + 3600,
                "iat": now,
            },
            private_pem,
            algorithm="RS256",
            headers={"kid": "test-key"},
        )

        signing_key = MagicMock()
        signing_key.key = public_pem

        with patch("backend.utils.auth.auth._jwks_client") as jwks_client:
            jwks_client.return_value.get_signing_key_from_jwt.return_value = signing_key
            claims = verify_access_token(token, config=config)

        self.assertEqual(claims["sub"], "user-sub-1")
        self.assertEqual(claims["username"], "alice")

    def test_verify_access_token_rejects_wrong_client(self):
        private_pem, public_pem = _rsa_keypair()
        config = CognitoConfig(
            region="eu-west-1",
            user_pool_id="eu-west-1_Example",
            app_client_id="client123",
            issuer="https://cognito-idp.eu-west-1.amazonaws.com/eu-west-1_Example",
        )
        now = int(time.time())
        token = jwt.encode(
            {
                "sub": "user-sub-1",
                "iss": config.issuer,
                "client_id": "other-client",
                "token_use": "access",
                "exp": now + 3600,
                "iat": now,
            },
            private_pem,
            algorithm="RS256",
            headers={"kid": "test-key"},
        )
        signing_key = MagicMock()
        signing_key.key = public_pem

        with patch("backend.utils.auth.auth._jwks_client") as jwks_client:
            jwks_client.return_value.get_signing_key_from_jwt.return_value = signing_key
            with self.assertRaises(AuthError):
                verify_access_token(token, config=config)


class TestProtectedRoutes(unittest.TestCase):
    """``before_request`` guards every route except /health and OPTIONS."""

    def setUp(self):
        # Anonymous client: must not inherit AuthenticatedClient from other tests.
        app.test_client_class = None
        self.client = app.test_client()

    def test_auth_me_unauthorized_without_header(self):
        response = self.client.get("/auth/me")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.get_json(), {"error": "Missing Authorization header"})

    def test_domain_routes_unauthorized_without_header(self):
        for method, path in (
            ("get", "/characters"),
            ("get", "/words"),
            ("get", "/hsk-level"),
            ("get", "/token-usage"),
            ("get", "/anki/status"),
            ("post", "/database/export"),
        ):
            with self.subTest(path=path):
                response = getattr(self.client, method)(path)
                self.assertEqual(response.status_code, 401)
                self.assertEqual(
                    response.get_json(),
                    {"error": "Missing Authorization header"},
                )

    def test_token_without_cognito_config_returns_service_unavailable(self):
        """A bearer token with Cognito unset is 503, not a silent 401."""
        with patch("backend.utils.auth.auth.load_cognito_config", return_value=None):
            response = self.client.get(
                "/auth/me",
                headers={"Authorization": "Bearer some.token.value"},
            )
        self.assertEqual(response.status_code, 503)
        self.assertEqual(
            response.get_json(),
            {"error": "Cognito is not configured on this server"},
        )

    def test_health_stays_public(self):
        with patch("backend.routes.health.db.session.execute"):
            response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)


class TestAuthMeRoute(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)

        self.user_patcher = patch("backend.routes.auth_me.current_user")
        self.mock_current_user = self.user_patcher.start()
        self.addCleanup(self.user_patcher.stop)
        self.mock_current_user.return_value = MagicMock(
            id=TEST_USER_ID,
            username="alice",
            email="alice@example.com",
            plan="free",
        )

    def test_auth_me_returns_user_row_and_token_claims(self):
        response = self.client.get("/auth/me")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            {
                "sub": TEST_USER_ID,
                "username": "alice",
                "email": "alice@example.com",
                "plan": "free",
                "is_admin": False,
                "token_use": TEST_CLAIMS["token_use"],
                "client_id": TEST_CLAIMS["client_id"],
            },
        )

    def test_auth_me_marks_admin_email(self):
        self.mock_current_user.return_value = MagicMock(
            id=TEST_USER_ID,
            username="admin",
            email="mazarsju@gmail.com",
            plan="free",
        )

        response = self.client.get("/auth/me")

        self.assertEqual(response.get_json()["is_admin"], True)


if __name__ == "__main__":
    unittest.main()
