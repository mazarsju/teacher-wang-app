import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock, patch

import backend.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.app import app  # noqa: E402
from auth_stub import (  # noqa: E402
    TEST_USER_ID,
    authenticated_client,
    patch_request_auth,
)


class TestCreateCharacterEndpoint(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)
        self.session_patcher = patch("backend.routes.create_character.db.session")
        self.mock_session = self.session_patcher.start()
        self.addCleanup(self.session_patcher.stop)

        self.character_patcher = patch("backend.routes.create_character.Character")
        self.mock_character_cls = self.character_patcher.start()
        self.addCleanup(self.character_patcher.stop)

        self.refresh_patcher = patch(
            "backend.routes.create_character.refresh_current_hsk_level"
        )
        self.mock_refresh = self.refresh_patcher.start()
        self.addCleanup(self.refresh_patcher.stop)

        self.mock_character_cls.reset_mock()
        self.mock_session.reset_mock()
        self.mock_refresh.reset_mock()
        self.mock_character_cls.query.filter_by.return_value.first.return_value = None

    def test_create_character_adds_record(self):
        updated_at = MagicMock(isoformat=MagicMock(return_value="2026-07-12T12:00:00+00:00"))

        def make_character(**kwargs):
            record = MagicMock(**kwargs)
            record.updated_at = updated_at
            record.pinyin_readings = [kwargs["pinyin"]]
            return record

        self.mock_character_cls.side_effect = make_character

        response = self.client.post(
            "/characters",
            json={"char": "爱", "pinyin": "ai", "writting_known": True},
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(
            response.get_json(),
            {
                "char": "爱",
                "pinyin": "ai",
                "pinyin_readings": ["ai"],
                "writting_known": True,
                "updated_at": "2026-07-12T12:00:00+00:00",
            },
        )
        self.mock_character_cls.assert_called_once_with(
            user_id=TEST_USER_ID,
            char="爱",
            pinyin="ai",
            writting_known=True,
        )
        self.mock_session.add.assert_called_once()
        self.mock_session.commit.assert_called_once()
        self.mock_refresh.assert_called_once_with(TEST_USER_ID)

    def test_create_existing_character_returns_conflict(self):
        self.mock_character_cls.query.filter_by.return_value.first.return_value = (
            MagicMock()
        )

        response = self.client.post(
            "/characters",
            json={"char": "爱", "pinyin": "ai", "writting_known": True},
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.get_json(), {"error": "Character already exists"})
        self.mock_session.add.assert_not_called()
        self.mock_session.commit.assert_not_called()
        self.mock_refresh.assert_not_called()

    def test_create_non_chinese_character_returns_error(self):
        response = self.client.post(
            "/characters",
            json={"char": "a", "pinyin": "ai", "writting_known": True},
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.get_json(),
            {"error": "char must be a single Chinese character"},
        )
        self.mock_session.add.assert_not_called()
        self.mock_session.commit.assert_not_called()
        self.mock_refresh.assert_not_called()


if __name__ == "__main__":
    unittest.main()
