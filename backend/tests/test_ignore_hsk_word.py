import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock, patch

import backend.utils.database.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.app import app  # noqa: E402
from auth_stub import (  # noqa: E402
    TEST_USER_ID,
    authenticated_client,
    patch_request_auth,
)


def make_word(word: str, frequency: int = 1) -> MagicMock:
    return MagicMock(
        id=f"{word}|py{frequency}",
        word=word,
        level=1,
        frequency=frequency,
        pinyin=f"py{frequency}",
        definition=f"definition {word}",
    )


class TestIgnoreHskWordEndpoint(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)

        self.session_patcher = patch("backend.routes.ignore_hsk_word.db.session")
        self.mock_session = self.session_patcher.start()
        self.addCleanup(self.session_patcher.stop)

        self.query_patcher = patch("backend.routes.ignore_hsk_word.IgnoreHskWord.query")
        self.mock_query = self.query_patcher.start()
        self.addCleanup(self.query_patcher.stop)
        self.mock_query.filter_by.return_value.filter.return_value.all.return_value = []

        self.model_patcher = patch("backend.routes.ignore_hsk_word.IgnoreHskWord")
        self.mock_model_cls = self.model_patcher.start()
        self.addCleanup(self.model_patcher.stop)
        self.mock_model_cls.query = self.mock_query
        self.mock_model_cls.side_effect = lambda **kwargs: MagicMock(**kwargs)

        self.suggest_patcher = patch("backend.routes.ignore_hsk_word.suggested_hsk_words")
        self.mock_suggest = self.suggest_patcher.start()
        self.addCleanup(self.suggest_patcher.stop)

    def test_ignoring_words_stores_them_and_returns_refreshed_suggestions(self):
        self.mock_suggest.return_value = [make_word("学", frequency=1)]

        response = self.client.post("/hsk-words/ignore", json={"words": ["爱", "水"]})

        self.assertEqual(response.status_code, 200)
        self.mock_query.filter_by.assert_called_once_with(user_id=TEST_USER_ID)
        added = self.mock_session.add_all.call_args.args[0]
        self.assertEqual({item.writing for item in added}, {"爱", "水"})
        self.assertTrue(all(item.user_id == TEST_USER_ID for item in added))
        self.mock_session.commit.assert_called_once()
        self.mock_suggest.assert_called_once_with(TEST_USER_ID, limit=10)
        self.assertEqual(
            response.get_json(),
            {
                "words": [
                    {
                        "id": "学|py1",
                        "word": "学",
                        "level": 1,
                        "frequency": 1,
                        "pinyin": "py1",
                        "definition": "definition 学",
                    }
                ]
            },
        )

    def test_skips_words_already_ignored(self):
        self.mock_query.filter_by.return_value.filter.return_value.all.return_value = [
            MagicMock(writing="爱")
        ]
        self.mock_suggest.return_value = []

        response = self.client.post("/hsk-words/ignore", json={"words": ["爱"]})

        self.assertEqual(response.status_code, 200)
        self.mock_session.add_all.assert_not_called()
        self.mock_session.commit.assert_not_called()

    def test_rejects_an_empty_words_list(self):
        response = self.client.post("/hsk-words/ignore", json={"words": ["  ", ""]})

        self.assertEqual(response.status_code, 400)
        self.mock_session.add_all.assert_not_called()


if __name__ == "__main__":
    unittest.main()
