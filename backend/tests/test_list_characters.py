import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock, patch

import backend.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.app import app  # noqa: E402


class TestListCharactersEndpoint(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        self.character_patcher = patch("backend.routes.list_characters.Character")
        self.mock_character_cls = self.character_patcher.start()
        self.addCleanup(self.character_patcher.stop)
        self.mock_character_cls.reset_mock()

    def test_list_characters_returns_all_records(self):
        updated_at = "2026-07-12T12:00:00+00:00"
        first = MagicMock(
            char="爱",
            pinyin="ai",
            writting_known=True,
            updated_at=MagicMock(isoformat=MagicMock(return_value=updated_at)),
        )
        second = MagicMock(
            char="好",
            pinyin="hao",
            writting_known=False,
            updated_at=MagicMock(isoformat=MagicMock(return_value=updated_at)),
        )
        self.mock_character_cls.query.order_by.return_value.all.return_value = [
            first,
            second,
        ]

        response = self.client.get("/characters")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            [
                {
                    "char": "爱",
                    "pinyin": "ai",
                    "writting_known": True,
                    "updated_at": updated_at,
                },
                {
                    "char": "好",
                    "pinyin": "hao",
                    "writting_known": False,
                    "updated_at": updated_at,
                },
            ],
        )
        self.mock_character_cls.query.order_by.assert_called_once()

    def test_list_characters_respects_limit(self):
        updated_at = "2026-07-12T12:00:00+00:00"
        first = MagicMock(
            char="爱",
            pinyin="ai",
            writting_known=True,
            updated_at=MagicMock(isoformat=MagicMock(return_value=updated_at)),
        )
        limited_query = MagicMock()
        limited_query.all.return_value = [first]
        ordered_query = MagicMock()
        ordered_query.limit.return_value = limited_query
        self.mock_character_cls.query.order_by.return_value = ordered_query

        response = self.client.get("/characters?limit=1")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.get_json()), 1)
        ordered_query.limit.assert_called_once_with(1)

    def test_list_characters_rejects_invalid_limit(self):
        response = self.client.get("/characters?limit=abc")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json(), {"error": "limit must be an integer"})


if __name__ == "__main__":
    unittest.main()
