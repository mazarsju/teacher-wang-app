import bootstrap  # noqa: F401
import unittest

from backend.utils.database.extensions import db
from backend.routes.suggest_hsk_words import hsk_translations, serialize_word
from backend.utils.database.models import HskWord, HskWordTranslation
from postgres_test_case import PostgresTestCase


class TestHskTranslations(PostgresTestCase):
    def setUp(self):
        super().setUp()
        db.session.add(
            HskWord(
                id="爱|ai4", word="爱", level=1, frequency=1, pinyin="ai4", definition="to love"
            )
        )
        db.session.commit()
        db.session.add(
            HskWordTranslation(hsk_word_id="爱|ai4", language="fr", translate="aimer")
        )
        db.session.commit()

    def test_skips_the_query_for_english(self):
        self.assertEqual(hsk_translations(["爱|ai4"], "en"), {})

    def test_returns_the_translation_for_the_matching_language(self):
        self.assertEqual(hsk_translations(["爱|ai4"], "fr"), {"爱|ai4": "aimer"})

    def test_returns_empty_when_no_translation_row_exists_for_the_language(self):
        self.assertEqual(hsk_translations(["爱|ai4"], "de"), {})

    def test_returns_empty_for_an_empty_word_id_list(self):
        self.assertEqual(hsk_translations([], "fr"), {})


class TestSerializeWordWithTranslations(PostgresTestCase):
    def setUp(self):
        super().setUp()
        self.word = HskWord(
            id="爱|ai4", word="爱", level=1, frequency=1, pinyin="ai4", definition="to love"
        )
        db.session.add(self.word)
        db.session.commit()

    def test_uses_the_translation_when_present(self):
        result = serialize_word(self.word, {"爱|ai4": "aimer"})
        self.assertEqual(result["definition"], "aimer")

    def test_falls_back_to_hsk_words_definition_when_the_word_has_no_translation(self):
        result = serialize_word(self.word, {"other|id": "unrelated"})
        self.assertEqual(result["definition"], "to love")

    def test_falls_back_to_hsk_words_definition_when_translations_is_none(self):
        result = serialize_word(self.word)
        self.assertEqual(result["definition"], "to love")


if __name__ == "__main__":
    unittest.main()
