import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock, patch

import backend.utils.database.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.app import app  # noqa: E402
from auth_stub import TEST_USER_ID, authenticated_client, patch_request_auth  # noqa: E402


class TestChatSetupPreferenceEndpoint(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)

        self.get_mode_patcher = patch(
            "backend.routes.chat_setup_preference.get_chat_listening_mode"
        )
        self.set_mode_patcher = patch(
            "backend.routes.chat_setup_preference.set_chat_listening_mode"
        )
        self.get_speed_patcher = patch(
            "backend.routes.chat_setup_preference.get_chat_listen_speed_adjustment"
        )
        self.set_speed_patcher = patch(
            "backend.routes.chat_setup_preference.set_chat_listen_speed_adjustment"
        )
        self.mock_get_mode = self.get_mode_patcher.start()
        self.mock_set_mode = self.set_mode_patcher.start()
        self.mock_get_speed = self.get_speed_patcher.start()
        self.mock_set_speed = self.set_speed_patcher.start()
        self.addCleanup(self.get_mode_patcher.stop)
        self.addCleanup(self.set_mode_patcher.stop)
        self.addCleanup(self.get_speed_patcher.stop)
        self.addCleanup(self.set_speed_patcher.stop)

        self.mock_get_mode.return_value = "reading_first"
        self.mock_get_speed.return_value = 0

    def test_get_returns_current_preference(self):
        self.mock_get_mode.return_value = "listening_first"
        self.mock_get_speed.return_value = 10

        response = self.client.get("/preferences/chat-setup")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            {"listening_mode": "listening_first", "listen_speed_adjustment": 10},
        )
        self.mock_get_mode.assert_called_once_with(TEST_USER_ID)
        self.mock_get_speed.assert_called_once_with(TEST_USER_ID)

    def test_patch_updates_listening_mode_only(self):
        response = self.client.patch(
            "/preferences/chat-setup", json={"listening_mode": "listening_first"}
        )

        self.assertEqual(response.status_code, 200)
        self.mock_set_mode.assert_called_once_with(
            TEST_USER_ID, "listening_first", commit=True
        )
        self.mock_set_speed.assert_not_called()

    def test_patch_updates_listen_speed_adjustment_only(self):
        response = self.client.patch(
            "/preferences/chat-setup", json={"listen_speed_adjustment": -20}
        )

        self.assertEqual(response.status_code, 200)
        self.mock_set_speed.assert_called_once_with(TEST_USER_ID, -20, commit=True)
        self.mock_set_mode.assert_not_called()

    def test_patch_rejects_invalid_listening_mode(self):
        response = self.client.patch(
            "/preferences/chat-setup", json={"listening_mode": "audio_only"}
        )

        self.assertEqual(response.status_code, 400)
        self.mock_set_mode.assert_not_called()

    def test_patch_rejects_invalid_listen_speed_adjustment(self):
        response = self.client.patch(
            "/preferences/chat-setup", json={"listen_speed_adjustment": 15}
        )

        self.assertEqual(response.status_code, 400)
        self.mock_set_speed.assert_not_called()

    def test_patch_rejects_boolean_as_listen_speed_adjustment(self):
        response = self.client.patch(
            "/preferences/chat-setup", json={"listen_speed_adjustment": False}
        )

        self.assertEqual(response.status_code, 400)
        self.mock_set_speed.assert_not_called()


if __name__ == "__main__":
    unittest.main()
