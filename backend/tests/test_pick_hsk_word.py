import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock, patch

import backend.utils.database.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.app import app  # noqa: E402
from backend.utils.knowledgeBase.hsk_word_picker import WordPickResult  # noqa: E402
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


class TestPickHskWordEndpoint(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)
        self.pick_patcher = patch("backend.routes.pick_hsk_word.pick_next_hsk_word")
        self.mock_pick = self.pick_patcher.start()
        self.addCleanup(self.pick_patcher.stop)

    def test_returns_the_picked_word_and_new_state(self):
        self.mock_pick.return_value = WordPickResult(
            next_word=make_word("爱", frequency=10),
            current_index=6,
            previous_index=2,
            increment=4,
            words_between=[make_word("好", frequency=8)],
        )

        response = self.client.post(
            "/hsk-words/next",
            json={
                "decision": "can_write",
                "current_index": 2,
                "previous_index": 0,
                "increment": 2,
                "exclude": ["学", "习"],
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            {
                "word": {
                    "id": "爱|py10",
                    "word": "爱",
                    "level": 1,
                    "frequency": 10,
                    "pinyin": "py10",
                    "definition": "definition 爱",
                },
                "current_index": 6,
                "previous_index": 2,
                "increment": 4,
                "words_between": [
                    {
                        "id": "好|py8",
                        "word": "好",
                        "level": 1,
                        "frequency": 8,
                        "pinyin": "py8",
                        "definition": "definition 好",
                    }
                ],
            },
        )
        self.mock_pick.assert_called_once_with(
            TEST_USER_ID,
            decision="can_write",
            current_index=2,
            previous_index=0,
            increment=2,
            exclude_words={"学", "习"},
        )

    def test_defaults_to_the_initial_pick_when_no_body_is_sent(self):
        self.mock_pick.return_value = WordPickResult(
            next_word=make_word("爱"),
            current_index=0,
            previous_index=-1,
            increment=1,
        )

        response = self.client.post("/hsk-words/next")

        self.assertEqual(response.status_code, 200)
        self.mock_pick.assert_called_once_with(
            TEST_USER_ID,
            decision=None,
            current_index=0,
            previous_index=-1,
            increment=1,
            exclude_words=set(),
        )

    def test_returns_null_word_when_nothing_is_left(self):
        self.mock_pick.return_value = WordPickResult(
            next_word=None,
            current_index=42,
            previous_index=10,
            increment=32,
        )

        response = self.client.post("/hsk-words/next", json={})

        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        self.assertIsNone(body["word"])
        self.assertEqual(body["words_between"], [])


if __name__ == "__main__":
    unittest.main()
