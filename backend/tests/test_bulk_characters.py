import bootstrap  # noqa: F401
import io
import sys
import unittest
from unittest.mock import MagicMock, patch

import backend.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

sys.modules.pop("backend.app", None)

from backend.app import app  # noqa: E402
from backend.character_sync import CharacterSyncResult  # noqa: E402
from auth_stub import (  # noqa: E402
    TEST_USER_ID,
    authenticated_client,
    patch_request_auth,
)


class TestBulkCharactersEndpoint(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)
        self.session_patcher = patch("backend.routes.bulk_characters.db.session")
        self.mock_session = self.session_patcher.start()
        self.addCleanup(self.session_patcher.stop)

        self.word_patcher = patch("backend.routes.bulk_characters.Word")
        self.mock_word_cls = self.word_patcher.start()
        self.addCleanup(self.word_patcher.stop)

        self.rebuild_patcher = patch(
            "backend.routes.bulk_characters.rebuild_characters_from_words"
        )
        self.mock_rebuild = self.rebuild_patcher.start()
        self.addCleanup(self.rebuild_patcher.stop)

        self.refresh_patcher = patch(
            "backend.routes.bulk_characters.refresh_current_hsk_level"
        )
        self.mock_refresh = self.refresh_patcher.start()
        self.addCleanup(self.refresh_patcher.stop)

        self.mock_word_cls.reset_mock()
        self.mock_session.reset_mock()
        self.mock_rebuild.reset_mock()
        self.mock_rebuild.return_value = CharacterSyncResult()
        self.mock_refresh.reset_mock()

        self.mock_word_cls.query.filter_by.return_value.first.return_value = None

    def test_no_file_submitted_returns_error(self):
        response = self.client.post("/characters/bulk")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json(), {"error": "No file provided"})
        self.mock_session.add.assert_not_called()
        self.mock_session.commit.assert_not_called()

    def test_invalid_format_missing_column_returns_error(self):
        data = {
            "file": (io.BytesIO("爱好,hobby,ai4 hao4\n".encode("utf-8")), "words.csv"),
        }

        response = self.client.post(
            "/characters/bulk",
            data=data,
            content_type="multipart/form-data",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.get_json(),
            {
                "error": (
                    "Invalid line format. Should have the format "
                    "'word,definition,pinyin,writting_known,synchronized,updated_at'."
                    "(error found in line: 爱好,hobby,ai4 hao4)"
                )
            },
        )
        self.mock_session.add.assert_not_called()
        self.mock_session.commit.assert_not_called()

    def test_invalid_updated_at_returns_error(self):
        data = {
            "file": (
                io.BytesIO(b"word,,pinyin,true,false,not-a-date\n"),
                "words.csv",
            ),
        }

        response = self.client.post(
            "/characters/bulk",
            data=data,
            content_type="multipart/form-data",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.get_json(),
            {
                "error": (
                    "Invalid updated_at value: not-a-date "
                    "(error found in line: word,,pinyin,true,false,not-a-date)"
                )
            },
        )
        self.mock_session.add.assert_not_called()
        self.mock_session.commit.assert_not_called()

    def test_valid_file_inserts_records_and_returns_success(self):
        created_words = []

        def make_word(**kwargs):
            record = MagicMock()
            record.word = kwargs["word"]
            created_words.append(record)
            return record

        self.mock_word_cls.side_effect = make_word

        file_content = (
            b"word,definition,pinyin,writting_known,synchronized,updated_at\n"
            b"\xe7\x88\xb1\xe5\xa5\xbd,hobby,ai4 hao4,true,false,"
            b"2026-07-12T12:00:00+00:00\n"
        )
        data = {
            "file": (io.BytesIO(file_content), "words.csv"),
        }

        response = self.client.post(
            "/characters/bulk",
            data=data,
            content_type="multipart/form-data",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            {"message": "File received", "updated_characters": [], "deleted_char_ids": []},
        )

        self.mock_word_cls.query.filter_by.assert_called_once_with(
            user_id=TEST_USER_ID,
            word="爱好",
        )
        self.mock_word_cls.assert_called_once_with(
            user_id=TEST_USER_ID,
            word="爱好",
        )

        self.assertEqual(len(created_words), 1)
        record = created_words[0]
        self.assertEqual(record.definition, "hobby")
        self.assertEqual(record.pinyin, "ai4 hao4")
        self.assertEqual(record.writting_known, True)
        self.assertEqual(record.synchronized, False)
        self.assertEqual(record.updated_at.isoformat(), "2026-07-12T12:00:00+00:00")

        self.mock_session.add.assert_called_once_with(record)
        self.mock_rebuild.assert_called_once_with(TEST_USER_ID)
        self.mock_session.commit.assert_called_once()
        self.mock_refresh.assert_called_once_with(TEST_USER_ID)

    def test_file_without_header_row_still_works(self):
        created_words = []

        def make_word(**kwargs):
            record = MagicMock()
            record.word = kwargs["word"]
            created_words.append(record)
            return record

        self.mock_word_cls.side_effect = make_word

        file_content = "爱好,hobby,ai4 hao4,true,false,2026-07-12T12:00:00+00:00\n"
        data = {
            "file": (io.BytesIO(file_content.encode("utf-8")), "words.csv"),
        }

        response = self.client.post(
            "/characters/bulk",
            data=data,
            content_type="multipart/form-data",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(created_words), 1)
        self.mock_session.commit.assert_called_once()
        self.mock_rebuild.assert_called_once_with(TEST_USER_ID)

    def test_existing_word_is_updated_not_duplicated(self):
        existing = MagicMock()
        existing.word = "爱好"
        self.mock_word_cls.query.filter_by.return_value.first.return_value = existing

        file_content = "爱好,hobby,ai4 hao4,true,false,2026-07-12T12:00:00+00:00\n"
        data = {
            "file": (io.BytesIO(file_content.encode("utf-8")), "words.csv"),
        }

        response = self.client.post(
            "/characters/bulk",
            data=data,
            content_type="multipart/form-data",
        )

        self.assertEqual(response.status_code, 200)
        self.mock_word_cls.assert_not_called()
        self.assertEqual(existing.definition, "hobby")
        self.assertEqual(existing.writting_known, True)
        self.mock_session.add.assert_not_called()
        self.mock_session.commit.assert_called_once()


if __name__ == "__main__":
    unittest.main()
