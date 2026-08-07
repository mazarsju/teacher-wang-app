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


class TestBulkCreateCharactersEndpoint(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)
        self.session_patcher = patch(
            "backend.routes.bulk_create_characters.db.session"
        )
        self.mock_session = self.session_patcher.start()
        self.addCleanup(self.session_patcher.stop)

        self.character_patcher = patch(
            "backend.routes.bulk_create_characters.Character"
        )
        self.mock_character_cls = self.character_patcher.start()
        self.addCleanup(self.character_patcher.stop)

        self.refresh_patcher = patch(
            "backend.routes.bulk_create_characters.refresh_current_hsk_level"
        )
        self.mock_refresh = self.refresh_patcher.start()
        self.addCleanup(self.refresh_patcher.stop)

        self.mock_character_cls.reset_mock()
        self.mock_session.reset_mock()
        self.mock_refresh.reset_mock()

        self.mock_character_cls.query.filter_by.return_value.filter.return_value.all.return_value = []

    def _set_existing_characters(self, chars: set):
        records = [MagicMock(char=char) for char in chars]
        self.mock_character_cls.query.filter_by.return_value.filter.return_value.all.return_value = (
            records
        )

    def test_bulk_create_characters_adds_records(self):
        updated_at = MagicMock(isoformat=MagicMock(return_value="2026-07-12T12:00:00+00:00"))

        def make_character(**kwargs):
            record = MagicMock(**kwargs)
            record.updated_at = updated_at
            record.pinyin_readings = [kwargs["pinyin"]]
            return record

        self.mock_character_cls.side_effect = make_character

        response = self.client.post(
            "/characters/bulk-create",
            json={
                "characters": [
                    {"char": "爱", "pinyin": "ai4", "writing_known": True},
                    {"char": "好", "pinyin": "hao4", "writing_known": False},
                ]
            },
        )

        self.assertEqual(response.status_code, 201)
        body = response.get_json()
        self.assertEqual([char["char"] for char in body["characters"]], ["爱", "好"])
        self.assertEqual(self.mock_session.add.call_count, 2)
        self.mock_session.commit.assert_called_once()
        self.mock_refresh.assert_called_once_with(TEST_USER_ID)

    def test_bulk_create_characters_rejects_more_than_limit(self):
        payload = {
            "characters": [
                {"char": "爱", "pinyin": "ai4", "writing_known": True}
                for _ in range(101)
            ]
        }

        response = self.client.post("/characters/bulk-create", json=payload)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.get_json(),
            {"error": "Cannot create more than 100 characters at once"},
        )
        self.mock_session.add.assert_not_called()
        self.mock_session.commit.assert_not_called()
        self.mock_refresh.assert_not_called()

    def test_bulk_create_characters_existing_character_returns_conflict(self):
        self._set_existing_characters({"爱"})

        response = self.client.post(
            "/characters/bulk-create",
            json={"characters": [{"char": "爱", "pinyin": "ai4", "writing_known": True}]},
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(
            response.get_json(), {"error": "Character '爱' already exists"}
        )
        self.mock_session.add.assert_not_called()
        self.mock_session.commit.assert_not_called()
        self.mock_refresh.assert_not_called()

    def test_bulk_create_characters_duplicate_within_payload_returns_error(self):
        response = self.client.post(
            "/characters/bulk-create",
            json={
                "characters": [
                    {"char": "爱", "pinyin": "ai4", "writing_known": True},
                    {"char": "爱", "pinyin": "ai4", "writing_known": False},
                ]
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.get_json(),
            {"error": "Item 1: character '爱' is duplicated in the request"},
        )
        self.mock_session.add.assert_not_called()
        self.mock_session.commit.assert_not_called()
        self.mock_refresh.assert_not_called()

    def test_bulk_create_characters_invalid_item_returns_error(self):
        response = self.client.post(
            "/characters/bulk-create",
            json={"characters": [{"char": "a", "pinyin": "ai4", "writing_known": True}]},
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.get_json(),
            {"error": "Item 0: char must be a single Chinese character"},
        )
        self.mock_session.add.assert_not_called()
        self.mock_session.commit.assert_not_called()
        self.mock_refresh.assert_not_called()

    def test_bulk_create_characters_requires_characters_list(self):
        response = self.client.post("/characters/bulk-create", json={})

        self.assertEqual(response.status_code, 400)
        self.mock_session.add.assert_not_called()
        self.mock_session.commit.assert_not_called()
        self.mock_refresh.assert_not_called()


if __name__ == "__main__":
    unittest.main()
