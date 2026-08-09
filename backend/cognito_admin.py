"""Admin-only Cognito Identity Provider actions requiring IAM credentials.

Unlike ``cognito_public.py`` (unauthenticated app-client calls), AdminDeleteUser
needs a SigV4-signed request, so it goes through boto3 with the server's AWS
credentials rather than raw HTTP.
"""

from __future__ import annotations

from backend.auth_config import load_cognito_config


class CognitoAdminError(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


def delete_cognito_user(sub: str) -> None:
    """Delete the Cognito account identified by its ``sub`` claim, if any."""
    config = load_cognito_config()
    if config is None:
        raise CognitoAdminError("Cognito is not configured on this server")

    import boto3
    from botocore.exceptions import ClientError

    client = boto3.client("cognito-idp", region_name=config.region)
    try:
        client.admin_delete_user(UserPoolId=config.user_pool_id, Username=sub)
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "")
        if code == "UserNotFoundException":
            return
        raise CognitoAdminError(str(exc)) from exc
