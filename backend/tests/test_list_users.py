import bootstrap  # noqa: F401
import unittest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import backend.utils.database.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.app import app  # noqa: E402
from auth_stub import authenticated_client, patch_request_auth  # noqa: E402


class TestListUsersEndpoint(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)

        self.current_user_patcher = patch("backend.routes.list_users.current_user")
        self.mock_current_user = self.current_user_patcher.start()
        self.addCleanup(self.current_user_patcher.stop)

        self.user_cls_patcher = patch("backend.routes.list_users.User")
        self.mock_user_cls = self.user_cls_patcher.start()
        self.addCleanup(self.user_cls_patcher.stop)

    def test_admin_can_list_users(self):
        self.mock_current_user.return_value = MagicMock(email="mazarsju@gmail.com")
        last_seen_a = datetime(2026, 1, 1, tzinfo=timezone.utc)
        last_seen_b = datetime(2026, 2, 2, tzinfo=timezone.utc)
        self.mock_user_cls.query.order_by.return_value.all.return_value = [
            MagicMock(
                shortid=1, email="a@example.com", plan="free", last_connection=last_seen_a
            ),
            MagicMock(
                shortid=2, email="b@example.com", plan="pro", last_connection=last_seen_b
            ),
        ]

        response = self.client.get("/admin/users")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            {
                "users": [
                    {
                        "id": "1",
                        "email": "a@example.com",
                        "plan": "free",
                        "last_connection": last_seen_a.isoformat(),
                    },
                    {
                        "id": "2",
                        "email": "b@example.com",
                        "plan": "pro",
                        "last_connection": last_seen_b.isoformat(),
                    },
                ]
            },
        )

    def test_non_admin_is_forbidden(self):
        self.mock_current_user.return_value = MagicMock(email="someone@example.com")

        response = self.client.get("/admin/users")

        self.assertEqual(response.status_code, 403)
        self.mock_user_cls.query.order_by.assert_not_called()


if __name__ == "__main__":
    unittest.main()
