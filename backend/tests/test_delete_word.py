import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock, patch

import backend.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.app import app  # noqa: E402
from backend.character_sync import CharacterSyncResult  # noqa: E402
from auth_stub import (  # noqa: E402
    TEST_USER_ID,
    authenticated_client,
    patch_request_auth,
)


class TestDeleteWordEndpoint(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)
        self.session_patcher = patch("backend.routes.delete_word.db.session")
        self.mock_session = self.session_patcher.start()
        self.addCleanup(self.session_patcher.stop)

        self.word_patcher = patch("backend.routes.delete_word.Word")
        self.mock_word_cls = self.word_patcher.start()
        self.addCleanup(self.word_patcher.stop)

        self.rebuild_patcher = patch(
            "backend.routes.delete_word.rebuild_characters_from_words"
        )
        self.mock_rebuild = self.rebuild_patcher.start()
        self.addCleanup(self.rebuild_patcher.stop)

        self.refresh_patcher = patch(
            "backend.routes.delete_word.refresh_current_hsk_level"
        )
        self.mock_refresh = self.refresh_patcher.start()
        self.addCleanup(self.refresh_patcher.stop)

        self.mock_word_cls.reset_mock()
        self.mock_session.reset_mock()
        self.mock_rebuild.reset_mock()
        self.mock_rebuild.return_value = CharacterSyncResult()
        self.mock_refresh.reset_mock()

    def test_delete_word_removes_record_and_links(self):
        word_record = MagicMock()
        self.mock_word_cls.query.filter_by.return_value.first.return_value = (
            word_record
        )

        response = self.client.delete("/words/爱好")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            {"message": "Word deleted", "updated_characters": [], "deleted_char_ids": []},
        )
        self.mock_word_cls.query.filter_by.assert_called_once_with(
            user_id=TEST_USER_ID,
            word="爱好",
        )
        self.mock_session.delete.assert_called_once_with(word_record)
        self.mock_rebuild.assert_called_once_with(TEST_USER_ID)
        self.mock_session.commit.assert_called_once()
        self.mock_refresh.assert_called_once_with(TEST_USER_ID)

    def test_delete_missing_word_returns_not_found(self):
        self.mock_word_cls.query.filter_by.return_value.first.return_value = None

        response = self.client.delete("/words/爱好")

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.get_json(), {"error": "Word not found"})
        self.mock_session.delete.assert_not_called()
        self.mock_session.commit.assert_not_called()


if __name__ == "__main__":
    unittest.main()
