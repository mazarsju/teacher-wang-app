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


class TestDeleteWordEndpoint(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)
        self.session_patcher = patch("backend.routes.delete_knowledge_base.db.session")
        self.mock_session = self.session_patcher.start()
        self.addCleanup(self.session_patcher.stop)

        self.word_patcher = patch("backend.routes.delete_knowledge_base.Word.query")
        self.mock_word_query = self.word_patcher.start()
        self.addCleanup(self.word_patcher.stop)

        self.character_patcher = patch("backend.routes.delete_knowledge_base.Character.query")
        self.mock_character_query = self.character_patcher.start()
        self.addCleanup(self.character_patcher.stop)

        self.ignore_vocab_card_patcher = patch("backend.routes.delete_knowledge_base.IgnoreVocabCard.query")
        self.mock_ignore_vocab_card_query = self.ignore_vocab_card_patcher.start()
        self.addCleanup(self.ignore_vocab_card_patcher.stop)

        self.ignore_writting_card_patcher = patch("backend.routes.delete_knowledge_base.IgnoreWrittingCard.query")
        self.mock_ignore_writting_card_query = self.ignore_writting_card_patcher.start()
        self.addCleanup(self.ignore_writting_card_patcher.stop)

    def test_delete_knowledge_base_removes_all_records(self):
        word_record = MagicMock()
        character_record = MagicMock()
        ignore_vocab_card_record = MagicMock()
        ignore_writting_card_record = MagicMock()

        self.mock_session.commit.return_value = None

        # Act
        response = self.client.delete("/database/knowledge-base")

        # Assert HTTP response
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {
            "message": "Knowledge base deleted",
        })

        # Assert
        self.mock_word_query.filter_by.assert_called_once_with(user_id=TEST_USER_ID)
        self.mock_character_query.filter_by.assert_called_once_with(user_id=TEST_USER_ID)
        self.mock_ignore_vocab_card_query.filter_by.assert_called_once_with(user_id=TEST_USER_ID)
        self.mock_ignore_writting_card_query.filter_by.assert_called_once_with(user_id=TEST_USER_ID)
        self.mock_session.commit.assert_called_once()

if __name__ == "__main__":
    unittest.main()
