import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock, patch

import backend.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.app import app  # noqa: E402
from auth_stub import authenticated_client, patch_request_auth  # noqa: E402


class TestListHskCharacterWordsEndpoint(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)
        self.hsk_patcher = patch(
            "backend.routes.list_hsk_character_words.HskCharacter"
        )
        self.mock_hsk_cls = self.hsk_patcher.start()
        self.addCleanup(self.hsk_patcher.stop)
        self.mock_hsk_cls.reset_mock()

    def test_list_hsk_character_words_returns_sorted_words(self):
        first = MagicMock(
            id="爱好|ai4 hao4",
            word="爱好",
            level=1,
            frequency=20,
            pinyin="ai4 hao4",
            definition="hobby",
        )
        second = MagicMock(
            id="爱|ai4",
            word="爱",
            level=1,
            frequency=10,
            pinyin="ai4",
            definition="to love",
        )
        entry = MagicMock()
        entry.words = [first, second]
        self.mock_hsk_cls.query.filter_by.return_value.first.return_value = entry

        response = self.client.get("/hsk-characters/爱/words")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            [
                {
                    "id": "爱|ai4",
                    "word": "爱",
                    "level": 1,
                    "frequency": 10,
                    "pinyin": "ai4",
                    "definition": "to love",
                },
                {
                    "id": "爱好|ai4 hao4",
                    "word": "爱好",
                    "level": 1,
                    "frequency": 20,
                    "pinyin": "ai4 hao4",
                    "definition": "hobby",
                },
            ],
        )
        self.mock_hsk_cls.query.filter_by.assert_called_once_with(character="爱")

    def test_list_hsk_character_words_filters_by_max_level(self):
        first = MagicMock(
            id="爱好|ai4 hao4",
            word="爱好",
            level=1,
            frequency=20,
            pinyin="ai4 hao4",
            definition="hobby",
        )
        second = MagicMock(
            id="可爱|ke3 ai4",
            word="可爱",
            level=2,
            frequency=30,
            pinyin="ke3 ai4",
            definition="cute",
        )
        third = MagicMock(
            id="爱情|ai4 qing2",
            word="爱情",
            level=4,
            frequency=40,
            pinyin="ai4 qing2",
            definition="love",
        )
        entry = MagicMock()
        entry.words = [first, second, third]
        self.mock_hsk_cls.query.filter_by.return_value.first.return_value = entry

        response = self.client.get("/hsk-characters/爱/words?level=2")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            [
                {
                    "id": "爱好|ai4 hao4",
                    "word": "爱好",
                    "level": 1,
                    "frequency": 20,
                    "pinyin": "ai4 hao4",
                    "definition": "hobby",
                },
                {
                    "id": "可爱|ke3 ai4",
                    "word": "可爱",
                    "level": 2,
                    "frequency": 30,
                    "pinyin": "ke3 ai4",
                    "definition": "cute",
                },
            ],
        )

    def test_list_hsk_character_words_missing_character_returns_404(self):
        self.mock_hsk_cls.query.filter_by.return_value.first.return_value = None

        response = self.client.get("/hsk-characters/爱/words")

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.get_json(), {"error": "HSK character not found"})


if __name__ == "__main__":
    unittest.main()
