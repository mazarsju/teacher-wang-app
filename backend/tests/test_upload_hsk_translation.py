import bootstrap  # noqa: F401
import io
import json
import unittest
import zipfile
from unittest.mock import MagicMock, patch

import backend.utils.database.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.app import app  # noqa: E402
from auth_stub import authenticated_client, patch_request_auth  # noqa: E402


def _make_zip(entries, filename="data.json"):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr(filename, json.dumps(entries))
    return buffer.getvalue()


class TestUploadHskTranslationEndpoint(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)

        self.current_user_patcher = patch(
            "backend.routes.upload_hsk_translation.current_user"
        )
        self.mock_current_user = self.current_user_patcher.start()
        self.mock_current_user.return_value = MagicMock(email="mazarsju@gmail.com")
        self.addCleanup(self.current_user_patcher.stop)

        self.hsk_word_patcher = patch(
            "backend.routes.upload_hsk_translation.HskWord"
        )
        self.mock_hsk_word_cls = self.hsk_word_patcher.start()
        self.addCleanup(self.hsk_word_patcher.stop)

        self.translation_patcher = patch(
            "backend.routes.upload_hsk_translation.HskWordTranslation"
        )
        self.mock_translation_cls = self.translation_patcher.start()
        self.addCleanup(self.translation_patcher.stop)

        self.db_patcher = patch("backend.routes.upload_hsk_translation.db")
        self.mock_db = self.db_patcher.start()
        self.addCleanup(self.db_patcher.stop)

        self.hsk_words = {}
        self.translations = {}

        def db_get(model, pk):
            if model is self.mock_hsk_word_cls:
                return self.hsk_words.get(pk)
            if model is self.mock_translation_cls:
                return self.translations.get(pk)
            return None

        self.mock_db.session.get.side_effect = db_get

    def _post(self, zip_bytes, language="en"):
        return self.client.post(
            "/admin/hsk/translation",
            data={
                "file": (io.BytesIO(zip_bytes), "data.zip"),
                "language": language,
            },
            content_type="multipart/form-data",
        )

    def test_non_admin_is_forbidden(self):
        self.mock_current_user.return_value = MagicMock(email="someone@example.com")

        response = self._post(_make_zip([]))

        self.assertEqual(response.status_code, 403)

    def test_rejects_missing_file(self):
        response = self.client.post(
            "/admin/hsk/translation", data={"language": "en"}
        )

        self.assertEqual(response.status_code, 400)

    def test_rejects_invalid_language(self):
        response = self._post(_make_zip([]), language="eng")

        self.assertEqual(response.status_code, 400)

    def test_rejects_non_zip_file(self):
        response = self.client.post(
            "/admin/hsk/translation",
            data={
                "file": (io.BytesIO(b"not a zip"), "data.zip"),
                "language": "en",
            },
            content_type="multipart/form-data",
        )

        self.assertEqual(response.status_code, 400)

    def test_rejects_zip_without_json(self):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            archive.writestr("data.txt", "not json")

        response = self._post(buffer.getvalue())

        self.assertEqual(response.status_code, 400)

    def test_rejects_unknown_hsk_word_id(self):
        response = self._post(_make_zip([{"id": "missing", "definition": "x"}]))

        self.assertEqual(response.status_code, 400)
        self.mock_db.session.commit.assert_not_called()

    def test_updates_hsk_words_definition_for_english(self):
        hsk_word = MagicMock()
        self.hsk_words["ni3hao3"] = hsk_word

        response = self._post(
            _make_zip([{"id": "ni3hao3", "definition": "hello"}]), language="en"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(hsk_word.definition, "hello")
        self.mock_translation_cls.assert_not_called()
        self.mock_db.session.commit.assert_called_once()

    def test_upserts_translation_for_other_language(self):
        self.hsk_words["ni3hao3"] = MagicMock()

        response = self._post(
            _make_zip([{"id": "ni3hao3", "definition": "bonjour"}]), language="fr"
        )

        self.assertEqual(response.status_code, 200)
        self.mock_translation_cls.assert_called_once_with(
            hsk_word_id="ni3hao3", language="fr"
        )
        self.mock_db.session.add.assert_called_once()
        self.mock_db.session.commit.assert_called_once()

    def test_updates_existing_translation_for_other_language(self):
        self.hsk_words["ni3hao3"] = MagicMock()
        existing_translation = MagicMock()
        self.translations[("ni3hao3", "fr")] = existing_translation

        response = self._post(
            _make_zip([{"id": "ni3hao3", "definition": "bonjour"}]), language="fr"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(existing_translation.translate, "bonjour")
        self.mock_translation_cls.assert_not_called()
        self.mock_db.session.add.assert_not_called()


if __name__ == "__main__":
    unittest.main()
