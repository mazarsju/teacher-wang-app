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


class TestBulkCreateWordsEndpoint(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)
        self.session_patcher = patch("backend.routes.bulk_create_words.db.session")
        self.mock_session = self.session_patcher.start()
        self.addCleanup(self.session_patcher.stop)

        self.rebuild_patcher = patch(
            "backend.routes.bulk_create_words.rebuild_characters_from_words"
        )
        self.mock_rebuild = self.rebuild_patcher.start()
        self.addCleanup(self.rebuild_patcher.stop)

        self.refresh_patcher = patch(
            "backend.routes.bulk_create_words.refresh_current_hsk_level"
        )
        self.mock_refresh = self.refresh_patcher.start()
        self.addCleanup(self.refresh_patcher.stop)

        self.word_patcher = patch("backend.routes.bulk_create_words.Word")
        self.mock_word_cls = self.word_patcher.start()
        self.addCleanup(self.word_patcher.stop)

        self.utcnow_patcher = patch("backend.routes.bulk_create_words.utcnow")
        self.mock_utcnow = self.utcnow_patcher.start()
        self.addCleanup(self.utcnow_patcher.stop)

        self.mock_word_cls.reset_mock()
        self.mock_session.reset_mock()
        self.mock_utcnow.reset_mock()
        self.mock_rebuild.reset_mock()
        self.mock_refresh.reset_mock()

        self.mock_word_cls.query.filter_by.return_value.filter.return_value.all.return_value = []

    def _set_existing_words(self, words: set):
        records = [MagicMock(word=word) for word in words]
        self.mock_word_cls.query.filter_by.return_value.filter.return_value.all.return_value = (
            records
        )

    def test_bulk_create_words_adds_records(self):
        updated_at = MagicMock(isoformat=MagicMock(return_value="2026-07-12T12:00:00+00:00"))
        self.mock_utcnow.return_value = updated_at

        def make_word(**kwargs):
            record = MagicMock(**kwargs)
            record.updated_at = updated_at
            return record

        self.mock_word_cls.side_effect = make_word

        response = self.client.post(
            "/words/bulk-create",
            json={
                "words": [
                    {"word": "爱好", "definition": "hobby", "pinyin": "ai4 hao3"},
                    {"word": "爱", "definition": None},
                ]
            },
        )

        self.assertEqual(response.status_code, 201)
        body = response.get_json()
        self.assertEqual([word["word"] for word in body["words"]], ["爱好", "爱"])
        self.assertEqual(self.mock_session.add.call_count, 2)
        self.mock_rebuild.assert_called_once_with(TEST_USER_ID)
        self.mock_session.commit.assert_called_once()
        self.mock_refresh.assert_called_once_with(TEST_USER_ID)

    def test_bulk_create_words_rejects_more_than_limit(self):
        payload = {"words": [{"word": "爱", "definition": ""} for _ in range(101)]}

        response = self.client.post("/words/bulk-create", json=payload)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.get_json(),
            {"error": "Cannot create more than 100 words at once"},
        )
        self.mock_session.add.assert_not_called()
        self.mock_rebuild.assert_not_called()
        self.mock_session.commit.assert_not_called()

    def test_bulk_create_words_existing_word_returns_conflict(self):
        self._set_existing_words({"爱好"})

        response = self.client.post(
            "/words/bulk-create",
            json={"words": [{"word": "爱好", "definition": "hobby"}]},
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.get_json(), {"error": "Word '爱好' already exists"})
        self.mock_session.add.assert_not_called()
        self.mock_rebuild.assert_not_called()
        self.mock_session.commit.assert_not_called()

    def test_bulk_create_words_duplicate_within_payload_returns_error(self):
        response = self.client.post(
            "/words/bulk-create",
            json={
                "words": [
                    {"word": "爱好", "definition": "hobby"},
                    {"word": "爱好", "definition": "hobby again"},
                ]
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.get_json(),
            {"error": "Item 1: word '爱好' is duplicated in the request"},
        )
        self.mock_session.add.assert_not_called()
        self.mock_rebuild.assert_not_called()
        self.mock_session.commit.assert_not_called()

    def test_bulk_create_words_invalid_item_returns_error(self):
        response = self.client.post(
            "/words/bulk-create",
            json={"words": [{"word": "hello", "definition": ""}]},
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.get_json(),
            {"error": "Item 0: word must contain at least one Chinese character"},
        )
        self.mock_session.add.assert_not_called()
        self.mock_rebuild.assert_not_called()
        self.mock_session.commit.assert_not_called()

    def test_bulk_create_words_allows_non_chinese_characters_mixed_with_chinese(self):
        updated_at = MagicMock(isoformat=MagicMock(return_value="2026-07-12T12:00:00+00:00"))
        self.mock_utcnow.return_value = updated_at

        def make_word(**kwargs):
            record = MagicMock(**kwargs)
            record.updated_at = updated_at
            return record

        self.mock_word_cls.side_effect = make_word

        response = self.client.post(
            "/words/bulk-create",
            json={
                "words": [
                    {"word": "A想B", "definition": "to think", "pinyin": "A xiang3 B"},
                ]
            },
        )

        self.assertEqual(response.status_code, 201)
        self.mock_rebuild.assert_called_once_with(TEST_USER_ID)

    def test_bulk_create_words_requires_words_list(self):
        response = self.client.post("/words/bulk-create", json={})

        self.assertEqual(response.status_code, 400)
        self.mock_session.add.assert_not_called()
        self.mock_rebuild.assert_not_called()
        self.mock_session.commit.assert_not_called()


if __name__ == "__main__":
    unittest.main()
