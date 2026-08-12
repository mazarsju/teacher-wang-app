import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock, patch

from botocore.exceptions import BotoCoreError, ClientError

from backend.utils.auth.cognito_admin import CognitoAdminError, delete_cognito_user


def _config():
    return MagicMock(
        region="eu-west-1",
        user_pool_id="eu-west-1_Example",
    )


class TestDeleteCognitoUser(unittest.TestCase):
    def test_raises_when_cognito_is_not_configured(self):
        with patch(
            "backend.utils.auth.cognito_admin.load_cognito_config", return_value=None
        ):
            with self.assertRaises(CognitoAdminError):
                delete_cognito_user("alice")

    @patch("backend.utils.auth.cognito_admin.load_cognito_config", return_value=_config())
    @patch("boto3.client")
    def test_calls_admin_delete_user_with_username(self, mock_client_factory, _):
        client = MagicMock()
        mock_client_factory.return_value = client

        delete_cognito_user("alice")

        client.admin_delete_user.assert_called_once_with(
            UserPoolId="eu-west-1_Example",
            Username="alice",
        )

    @patch("backend.utils.auth.cognito_admin.load_cognito_config", return_value=_config())
    @patch("boto3.client")
    def test_user_not_found_is_ignored(self, mock_client_factory, _):
        client = MagicMock()
        mock_client_factory.return_value = client
        client.admin_delete_user.side_effect = ClientError(
            {"Error": {"Code": "UserNotFoundException", "Message": "gone"}},
            "AdminDeleteUser",
        )

        delete_cognito_user("alice")

    @patch("backend.utils.auth.cognito_admin.load_cognito_config", return_value=_config())
    @patch("boto3.client")
    def test_access_denied_becomes_cognito_admin_error(
        self, mock_client_factory, _
    ):
        client = MagicMock()
        mock_client_factory.return_value = client
        client.admin_delete_user.side_effect = ClientError(
            {"Error": {"Code": "AccessDeniedException", "Message": "denied"}},
            "AdminDeleteUser",
        )

        with self.assertRaises(CognitoAdminError):
            delete_cognito_user("alice")

    @patch("backend.utils.auth.cognito_admin.load_cognito_config", return_value=_config())
    @patch("boto3.client")
    def test_botocore_errors_become_cognito_admin_error(
        self, mock_client_factory, _
    ):
        client = MagicMock()
        mock_client_factory.return_value = client
        client.admin_delete_user.side_effect = BotoCoreError()

        with self.assertRaises(CognitoAdminError):
            delete_cognito_user("alice")


if __name__ == "__main__":
    unittest.main()
