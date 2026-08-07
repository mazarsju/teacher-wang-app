import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock, patch

import backend.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.app import app  # noqa: E402
from auth_stub import authenticated_client, patch_request_auth  # noqa: E402


class TestListWordsEndpoint(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)
        self.word_patcher = patch("backend.routes.list_words.Word")
        self.mock_word_cls = self.word_patcher.start()
        self.addCleanup(self.word_patcher.stop)
        self.mock_word_cls.reset_mock()
        self.scoped_query = self.mock_word_cls.query.filter_by.return_value

    def test_list_words_returns_all_records(self):
        updated_at = "2026-07-12T12:00:00+00:00"
        first = MagicMock(
            word="爱好",
            definition="hobby",
            pinyin="ai4 hao3",
            writing_known=True,
            updated_at=MagicMock(isoformat=MagicMock(return_value=updated_at)),
            characters=[MagicMock(char="爱"), MagicMock(char="好")],
        )
        second = MagicMock(
            word="爱",
            definition=None,
            pinyin=None,
            writing_known=False,
            updated_at=MagicMock(isoformat=MagicMock(return_value=updated_at)),
            characters=[MagicMock(char="爱")],
        )
        self.scoped_query.order_by.return_value.all.return_value = [
            first,
            second,
        ]

        response = self.client.get("/words")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            [
                {
                    "word": "爱好",
                    "definition": "hobby",
                    "pinyin": "ai4 hao3",
                    "writing_known": True,
                    "updated_at": updated_at,
                    "characters": ["爱", "好"],
                },
                {
                    "word": "爱",
                    "definition": None,
                    "pinyin": None,
                    "writing_known": False,
                    "updated_at": updated_at,
                    "characters": ["爱"],
                },
            ],
        )
        self.scoped_query.order_by.assert_called_once()

    def test_list_words_respects_limit(self):
        updated_at = "2026-07-12T12:00:00+00:00"
        first = MagicMock(
            word="爱好",
            definition="hobby",
            pinyin="ai4 hao3",
            writing_known=False,
            updated_at=MagicMock(isoformat=MagicMock(return_value=updated_at)),
            characters=[MagicMock(char="爱"), MagicMock(char="好")],
        )
        limited_query = MagicMock()
        limited_query.all.return_value = [first]
        ordered_query = MagicMock()
        ordered_query.limit.return_value = limited_query
        self.scoped_query.order_by.return_value = ordered_query

        response = self.client.get("/words?limit=1")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.get_json()), 1)
        ordered_query.limit.assert_called_once_with(1)

    def test_list_words_rejects_invalid_limit(self):
        response = self.client.get("/words?limit=0")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.get_json(),
            {"error": "limit must be a positive integer"},
        )


if __name__ == "__main__":
    unittest.main()
