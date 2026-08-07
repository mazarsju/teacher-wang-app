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


class TestCreateWordEndpoint(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)
        self.session_patcher = patch("backend.routes.create_word.db.session")
        self.mock_session = self.session_patcher.start()
        self.addCleanup(self.session_patcher.stop)

        self.rebuild_patcher = patch(
            "backend.routes.create_word.rebuild_characters_from_words"
        )
        self.mock_rebuild = self.rebuild_patcher.start()
        self.addCleanup(self.rebuild_patcher.stop)

        self.refresh_patcher = patch(
            "backend.routes.create_word.refresh_current_hsk_level"
        )
        self.mock_refresh = self.refresh_patcher.start()
        self.addCleanup(self.refresh_patcher.stop)

        self.word_patcher = patch("backend.routes.create_word.Word")
        self.mock_word_cls = self.word_patcher.start()
        self.addCleanup(self.word_patcher.stop)

        self.utcnow_patcher = patch("backend.routes.create_word.utcnow")
        self.mock_utcnow = self.utcnow_patcher.start()
        self.addCleanup(self.utcnow_patcher.stop)

        self.mock_word_cls.reset_mock()
        self.mock_session.reset_mock()
        self.mock_utcnow.reset_mock()
        self.mock_rebuild.reset_mock()
        self.mock_refresh.reset_mock()

        self.mock_word_cls.query.filter_by.return_value.first.return_value = None

    def test_create_word_adds_record_and_rebuilds_characters(self):
        updated_at = MagicMock(isoformat=MagicMock(return_value="2026-07-12T12:00:00+00:00"))

        def make_word(**kwargs):
            record = MagicMock(**kwargs)
            record.updated_at = updated_at
            return record

        self.mock_word_cls.side_effect = make_word
        self.mock_utcnow.return_value = updated_at

        response = self.client.post(
            "/words",
            json={"word": "爱好", "definition": "hobby", "pinyin": "ai4 hao3"},
        )

        self.assertEqual(response.status_code, 201)
        self.mock_word_cls.assert_called_once_with(
            user_id=TEST_USER_ID,
            word="爱好",
            definition="hobby",
            pinyin="ai4 hao3",
            updated_at=updated_at,
        )
        self.mock_session.add.assert_called_once()
        self.mock_rebuild.assert_called_once_with(TEST_USER_ID)
        self.mock_session.commit.assert_called_once()
        self.mock_refresh.assert_called_once_with(TEST_USER_ID)

    def test_create_word_without_any_chinese_character_returns_error(self):
        response = self.client.post(
            "/words",
            json={"word": "hello", "definition": "hobby"},
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.get_json(),
            {"error": "word must contain at least one Chinese character"},
        )
        self.mock_session.add.assert_not_called()
        self.mock_rebuild.assert_not_called()
        self.mock_session.commit.assert_not_called()

    def test_create_word_allows_non_chinese_characters_mixed_with_chinese(self):
        updated_at = MagicMock(isoformat=MagicMock(return_value="2026-07-12T12:00:00+00:00"))

        def make_word(**kwargs):
            record = MagicMock(**kwargs)
            record.updated_at = updated_at
            return record

        self.mock_word_cls.side_effect = make_word
        self.mock_utcnow.return_value = updated_at

        response = self.client.post(
            "/words",
            json={"word": "A想B", "definition": "to think", "pinyin": "A xiang3 B"},
        )

        self.assertEqual(response.status_code, 201)
        self.mock_rebuild.assert_called_once_with(TEST_USER_ID)


if __name__ == "__main__":
    unittest.main()
