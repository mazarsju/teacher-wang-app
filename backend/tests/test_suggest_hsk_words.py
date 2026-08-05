import bootstrap  # noqa: F401
import unittest
from unittest.mock import patch

import backend.database as database_module
from unittest.mock import MagicMock

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


class TestSuggestHskWordsEndpoint(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)
        self.patcher = patch("backend.routes.suggest_hsk_words.suggested_hsk_words")
        self.mock_suggest = self.patcher.start()
        self.addCleanup(self.patcher.stop)

    def test_returns_the_suggested_words(self):
        self.mock_suggest.return_value = [make_word("爱", frequency=1)]

        response = self.client.get("/hsk-words/suggestions")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            {
                "words": [
                    {
                        "id": "爱|py1",
                        "word": "爱",
                        "level": 1,
                        "frequency": 1,
                        "pinyin": "py1",
                        "definition": "definition 爱",
                    }
                ]
            },
        )
        self.mock_suggest.assert_called_once_with(TEST_USER_ID, limit=10)

    def test_returns_an_empty_list_when_nothing_is_left(self):
        self.mock_suggest.return_value = []

        response = self.client.get("/hsk-words/suggestions")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"words": []})


if __name__ == "__main__":
    unittest.main()
