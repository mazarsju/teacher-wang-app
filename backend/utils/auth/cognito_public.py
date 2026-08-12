"""Unauthenticated Cognito Identity Provider actions.

ForgotPassword / ConfirmForgotPassword are public app-client calls (no IAM
signature, no AWS credentials) -- the same pattern the frontend already uses
directly for sign-up/login in cognitoAuth.ts.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request

from backend.utils.auth.auth_config import CognitoConfig, load_cognito_config


class CognitoPublicError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def _require_config() -> CognitoConfig:
    config = load_cognito_config()
    if config is None:
        raise CognitoPublicError("NotConfigured", "Cognito is not configured on this server")
    return config


def _request(config: CognitoConfig, target: str, body: dict) -> None:
    req = urllib.request.Request(
        f"https://cognito-idp.{config.region}.amazonaws.com/",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/x-amz-json-1.1",
            "X-Amz-Target": f"AWSCognitoIdentityProviderService.{target}",
        },
        method="POST",
    )
    try:
        urllib.request.urlopen(req, timeout=10)
    except urllib.error.HTTPError as exc:
        payload = json.loads(exc.read().decode("utf-8") or "{}")
        code = str(payload.get("__type", "UnknownError")).split("#")[-1]
        message = payload.get("message") or payload.get("Message") or "Cognito request failed."
        raise CognitoPublicError(code, message) from exc


def forgot_password(username: str) -> None:
    """Ask Cognito to email a password-reset confirmation code."""
    config = _require_config()
    _request(config, "ForgotPassword", {"ClientId": config.app_client_id, "Username": username})


def confirm_forgot_password(username: str, confirmation_code: str, new_password: str) -> None:
    """Verify the emailed code and set the new password."""
    config = _require_config()
    _request(
        config,
        "ConfirmForgotPassword",
        {
            "ClientId": config.app_client_id,
            "Username": username,
            "ConfirmationCode": confirmation_code,
            "Password": new_password,
        },
    )
