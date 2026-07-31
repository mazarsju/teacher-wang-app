"""Cognito stubs so route tests can call the (now protected) API endpoints.

``register_routes`` installs a ``before_request`` hook that rejects anonymous
requests and upserts the ``users`` row. Route unit tests mock the database
away, so they stub token verification and tenant resolution instead.
"""

from __future__ import annotations

from unittest.mock import patch

from flask import Flask, g
from flask.testing import FlaskClient
from werkzeug.datastructures import Headers

TEST_USER_ID = "test-user"
TEST_USERNAME = "test"
TEST_CLIENT_ID = "test-client"
TEST_ACCESS_TOKEN = "test.access.token"

TEST_CLAIMS = {
    "sub": TEST_USER_ID,
    "username": TEST_USERNAME,
    "token_use": "access",
    "client_id": TEST_CLIENT_ID,
}

AUTH_HEADERS = {"Authorization": f"Bearer {TEST_ACCESS_TOKEN}"}


class AuthenticatedClient(FlaskClient):
    """Test client that sends a bearer token unless the test sets its own."""

    def open(self, *args, **kwargs):
        headers = Headers(kwargs.get("headers") or {})
        if "Authorization" not in headers:
            headers.set("Authorization", AUTH_HEADERS["Authorization"])
        kwargs["headers"] = headers
        return super().open(*args, **kwargs)


def authenticated_client(app: Flask) -> FlaskClient:
    app.test_client_class = AuthenticatedClient
    return app.test_client()


def stub_current_user() -> None:
    g.cognito_claims = TEST_CLAIMS
    g.cognito_sub = TEST_USER_ID
    g.current_user_id = TEST_USER_ID


def patch_request_auth(test_case) -> None:
    """Accept the stub token and resolve the tenant without touching Postgres."""
    patchers = (
        patch("backend.user_context.verify_access_token", return_value=TEST_CLAIMS),
        patch(
            "backend.user_context.ensure_current_user",
            side_effect=stub_current_user,
        ),
    )
    for patcher in patchers:
        patcher.start()
        test_case.addCleanup(patcher.stop)
