import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock

from backend.db_export import serialize_database, word_to_csv_row


def make_word(**kwargs):
    word = MagicMock()
    word.word = kwargs.get("word", "爱好")
    word.definition = kwargs.get("definition", "hobby")
    word.pinyin = kwargs.get("pinyin", "ai4 hao4")
    word.writting_known = kwargs.get("writting_known", True)
    word.synchronized = kwargs.get("synchronized", False)
    word.updated_at = MagicMock(
        isoformat=MagicMock(return_value="2026-07-12T12:00:00+00:00")
    )
    return word


class TestDbExport(unittest.TestCase):
    def test_word_to_csv_row(self):
        word = make_word()

        self.assertEqual(
            word_to_csv_row(word),
            ["爱好", "hobby", "ai4 hao4", "true", "false", "2026-07-12T12:00:00+00:00"],
        )

    def test_word_to_csv_row_blank_fields(self):
        word = make_word(definition=None, pinyin=None, writting_known=False, synchronized=True)

        self.assertEqual(
            word_to_csv_row(word),
            ["爱好", "", "", "false", "true", "2026-07-12T12:00:00+00:00"],
        )

    def test_serialize_database(self):
        word = make_word()

        self.assertEqual(
            serialize_database([word]),
            "word,definition,pinyin,writting_known,synchronized,updated_at\r\n"
            "爱好,hobby,ai4 hao4,true,false,2026-07-12T12:00:00+00:00\r\n",
        )

    def test_serialize_database_empty(self):
        self.assertEqual(
            serialize_database([]),
            "word,definition,pinyin,writting_known,synchronized,updated_at\r\n",
        )


if __name__ == "__main__":
    unittest.main()
