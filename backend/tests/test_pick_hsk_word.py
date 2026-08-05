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


class TestPickHskWordEndpoint(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)
        self.pick_patcher = patch("backend.routes.pick_hsk_word.pick_next_hsk_word")
        self.mock_pick = self.pick_patcher.start()
        self.addCleanup(self.pick_patcher.stop)

    def test_returns_the_picked_word(self):
        self.mock_pick.return_value = MagicMock(
            id="爱|ai4",
            word="爱",
            level=1,
            frequency=10,
            pinyin="ai4",
            definition="to love",
            characters=[MagicMock(character="爱")],
        )

        response = self.client.get("/hsk-words/next?exclude=好,学")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            {
                "word": {
                    "id": "爱|ai4",
                    "word": "爱",
                    "level": 1,
                    "frequency": 10,
                    "pinyin": "ai4",
                    "definition": "to love",
                    "characters": ["爱"],
                }
            },
        )
        self.mock_pick.assert_called_once_with(TEST_USER_ID, {"好", "学"})

    def test_returns_null_word_when_nothing_is_left(self):
        self.mock_pick.return_value = None

        response = self.client.get("/hsk-words/next")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"word": None})
        self.mock_pick.assert_called_once_with(TEST_USER_ID, set())


if __name__ == "__main__":
    unittest.main()
