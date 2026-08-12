import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock, patch

import backend.utils.database.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.app import app  # noqa: E402
from backend.utils.knowledgeBase.character_sync import CharacterSyncResult  # noqa: E402
from auth_stub import TEST_USER_ID, authenticated_client, patch_request_auth  # noqa: E402


class TestUpdateWordEndpoint(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)
        self.session_patcher = patch("backend.routes.update_word.db.session")
        self.mock_session = self.session_patcher.start()
        self.addCleanup(self.session_patcher.stop)

        self.word_patcher = patch("backend.routes.update_word.Word")
        self.mock_word_cls = self.word_patcher.start()
        self.addCleanup(self.word_patcher.stop)

        self.utcnow_patcher = patch("backend.routes.update_word.utcnow")
        self.mock_utcnow = self.utcnow_patcher.start()
        self.addCleanup(self.utcnow_patcher.stop)

        self.rebuild_patcher = patch(
            "backend.routes.update_word.rebuild_characters_from_words"
        )
        self.mock_rebuild = self.rebuild_patcher.start()
        self.addCleanup(self.rebuild_patcher.stop)

        self.refresh_patcher = patch(
            "backend.routes.update_word.refresh_current_hsk_level"
        )
        self.mock_refresh = self.refresh_patcher.start()
        self.addCleanup(self.refresh_patcher.stop)

        self.mock_word_cls.reset_mock()
        self.mock_session.reset_mock()
        self.mock_utcnow.reset_mock()
        self.mock_rebuild.reset_mock()
        self.mock_rebuild.return_value = CharacterSyncResult()
        self.mock_refresh.reset_mock()

    def test_update_word_updates_record(self):
        updated_at = MagicMock(isoformat=MagicMock(return_value="2026-07-12T12:00:00+00:00"))
        word_record = MagicMock(
            word="爱好",
            definition="old",
            pinyin="ai4 hao3",
            writing_known=False,
            updated_at=updated_at,
        )
        self.mock_word_cls.query.filter_by.return_value.first.return_value = (
            word_record
        )
        self.mock_utcnow.return_value = updated_at

        response = self.client.patch(
            "/words/爱好",
            json={"definition": "hobby", "pinyin": "ai4 hao3", "writing_known": True},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            {
                "word": "爱好",
                "definition": "hobby",
                "pinyin": "ai4 hao3",
                "writing_known": True,
                "updated_at": "2026-07-12T12:00:00+00:00",
                "characters": ["爱", "好"],
                "updated_characters": [],
                "deleted_char_ids": [],
            },
        )
        self.assertEqual(word_record.definition, "hobby")
        self.assertEqual(word_record.pinyin, "ai4 hao3")
        self.assertTrue(word_record.writing_known)
        self.mock_rebuild.assert_called_once_with(TEST_USER_ID)
        self.mock_session.commit.assert_called_once()
        self.mock_refresh.assert_called_once_with(TEST_USER_ID)

    def test_update_word_rejects_non_boolean_writing_known(self):
        word_record = MagicMock(
            word="爱好", definition="old", pinyin="ai4 hao3", writing_known=False
        )
        self.mock_word_cls.query.filter_by.return_value.first.return_value = (
            word_record
        )

        response = self.client.patch(
            "/words/爱好",
            json={"definition": "hobby", "writing_known": "yes"},
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.get_json(), {"error": "writing_known must be a boolean"}
        )
        self.mock_session.commit.assert_not_called()

    def test_update_word_leaves_pinyin_unchanged_when_omitted(self):
        updated_at = MagicMock(isoformat=MagicMock(return_value="2026-07-12T12:00:00+00:00"))
        word_record = MagicMock(
            word="爱好",
            definition="old",
            pinyin="ai4 hao3",
            writing_known=False,
            updated_at=updated_at,
        )
        self.mock_word_cls.query.filter_by.return_value.first.return_value = (
            word_record
        )
        self.mock_utcnow.return_value = updated_at

        response = self.client.patch("/words/爱好", json={"definition": "hobby"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["pinyin"], "ai4 hao3")

    def test_update_word_rejects_non_string_pinyin(self):
        word_record = MagicMock(word="爱好", definition="old", pinyin="ai4 hao3")
        self.mock_word_cls.query.filter_by.return_value.first.return_value = (
            word_record
        )

        response = self.client.patch(
            "/words/爱好",
            json={"definition": "hobby", "pinyin": 123},
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json(), {"error": "pinyin must be a string"})
        self.mock_session.commit.assert_not_called()

    def test_update_missing_word_returns_not_found(self):
        self.mock_word_cls.query.filter_by.return_value.first.return_value = None

        response = self.client.patch(
            "/words/爱好",
            json={"definition": "hobby"},
        )

        self.assertEqual(response.status_code, 404)
        self.mock_session.commit.assert_not_called()

    def test_update_word_with_invalid_body_returns_error(self):
        response = self.client.patch("/words/爱好", json={})

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.get_json(),
            {"error": "Missing required field: definition"},
        )


if __name__ == "__main__":
    unittest.main()
