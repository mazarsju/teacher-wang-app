import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock, patch

import backend.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.app import app  # noqa: E402
from auth_stub import authenticated_client, patch_request_auth  # noqa: E402


class TestUpdateUserEndpoint(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)

        self.current_user_patcher = patch("backend.routes.update_user.current_user")
        self.mock_current_user = self.current_user_patcher.start()
        self.mock_current_user.return_value = MagicMock(email="mazarsju@gmail.com")
        self.addCleanup(self.current_user_patcher.stop)

        self.user_cls_patcher = patch("backend.routes.update_user.User")
        self.mock_user_cls = self.user_cls_patcher.start()
        self.addCleanup(self.user_cls_patcher.stop)

        self.session_patcher = patch("backend.routes.update_user.db.session")
        self.mock_session = self.session_patcher.start()
        self.addCleanup(self.session_patcher.stop)

        self.set_setting_patcher = patch("backend.routes.update_user.set_setting")
        self.mock_set_setting = self.set_setting_patcher.start()
        self.addCleanup(self.set_setting_patcher.stop)

    def test_upgrading_to_pro_grants_ten_million_tokens(self):
        target = MagicMock(shortid=1, email="a@example.com", plan="free")
        self.mock_user_cls.query.filter_by.return_value.first.return_value = target

        response = self.client.patch("/admin/users/1", json={"plan": "pro"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(), {"id": "1", "email": "a@example.com", "plan": "pro"}
        )
        self.assertEqual(target.plan, "pro")
        self.mock_set_setting.assert_called_once_with(
            target.shortid, "available_token", "10000000"
        )
        self.mock_session.commit.assert_called_once()

    def test_downgrading_to_free_resets_to_hundred_thousand_tokens(self):
        target = MagicMock(shortid=2, email="b@example.com", plan="pro")
        self.mock_user_cls.query.filter_by.return_value.first.return_value = target

        response = self.client.patch("/admin/users/2", json={"plan": "free"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(target.plan, "free")
        self.mock_set_setting.assert_called_once_with(
            target.shortid, "available_token", "100000"
        )

    def test_same_plan_does_not_touch_tokens(self):
        target = MagicMock(shortid=3, email="c@example.com", plan="free")
        self.mock_user_cls.query.filter_by.return_value.first.return_value = target

        response = self.client.patch("/admin/users/3", json={"plan": "free"})

        self.assertEqual(response.status_code, 200)
        self.mock_set_setting.assert_not_called()
        self.mock_session.commit.assert_called_once()

    def test_missing_user_returns_not_found(self):
        self.mock_user_cls.query.filter_by.return_value.first.return_value = None

        response = self.client.patch("/admin/users/99", json={"plan": "pro"})

        self.assertEqual(response.status_code, 404)

    def test_invalid_plan_returns_error(self):
        response = self.client.patch("/admin/users/1", json={"plan": "gold"})

        self.assertEqual(response.status_code, 400)

    def test_non_admin_is_forbidden(self):
        self.mock_current_user.return_value = MagicMock(email="someone@example.com")

        response = self.client.patch("/admin/users/1", json={"plan": "pro"})

        self.assertEqual(response.status_code, 403)
        self.mock_user_cls.query.filter_by.assert_not_called()


if __name__ == "__main__":
    unittest.main()
