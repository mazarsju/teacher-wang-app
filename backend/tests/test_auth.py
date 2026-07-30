import bootstrap  # noqa: F401
import time
import unittest
from unittest.mock import MagicMock, patch

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

import backend.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.app import app  # noqa: E402
from backend.auth import AuthError, extract_bearer_token, verify_access_token
from backend.auth_config import CognitoConfig


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

        with patch("backend.auth._jwks_client") as jwks_client:
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

        with patch("backend.auth._jwks_client") as jwks_client:
            jwks_client.return_value.get_signing_key_from_jwt.return_value = signing_key
            with self.assertRaises(AuthError):
                verify_access_token(token, config=config)


class TestAuthMeRoute(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_auth_me_unauthorized_without_header(self):
        response = self.client.get("/auth/me")
        self.assertEqual(response.status_code, 401)
        self.assertIn("error", response.get_json())

    def test_auth_me_ok_with_valid_token(self):
        claims = {
            "sub": "user-sub-1",
            "username": "alice",
            "token_use": "access",
            "client_id": "client123",
        }
        with patch("backend.auth.verify_access_token", return_value=claims):
            response = self.client.get(
                "/auth/me",
                headers={"Authorization": "Bearer fake.token.value"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            {
                "sub": "user-sub-1",
                "username": "alice",
                "token_use": "access",
                "client_id": "client123",
            },
        )


if __name__ == "__main__":
    unittest.main()
