import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock

from backend.db_export import format_character_line, serialize_database, split_pinyin


class TestDbExport(unittest.TestCase):
    def test_split_pinyin_with_tone(self):
        self.assertEqual(split_pinyin("ai4"), ("ai", "4"))
        self.assertEqual(split_pinyin("hao3"), ("hao", "3"))

    def test_split_pinyin_without_tone(self):
        self.assertEqual(split_pinyin("er"), ("er", ""))

    def test_format_character_line(self):
        character = MagicMock()
        character.char = "爱"
        character.pinyin = "ai4"
        character.writting_known = True
        character.updated_at = MagicMock(
            isoformat=MagicMock(return_value="2026-07-12T12:00:00+00:00")
        )
        first_word = MagicMock()
        first_word.word = "爱好"
        second_word = MagicMock()
        second_word.word = "相爱"

        self.assertEqual(
            format_character_line(character, [first_word, second_word]),
            "爱;ai;4;true;爱好, 相爱;2026-07-12T12:00:00+00:00",
        )

    def test_format_character_line_without_words(self):
        character = MagicMock()
        character.char = "啊"
        character.pinyin = "a"
        character.writting_known = True
        character.updated_at = MagicMock(
            isoformat=MagicMock(return_value="2026-07-12T12:00:00+00:00")
        )

        self.assertEqual(
            format_character_line(character, []),
            "啊;a;;true;;2026-07-12T12:00:00+00:00",
        )

    def test_serialize_database(self):
        character = MagicMock()
        character.user_id = 1
        character.char = "爱"
        character.pinyin = "ai4"
        character.writting_known = True
        character.updated_at = MagicMock(
            isoformat=MagicMock(return_value="2026-07-12T12:00:00+00:00")
        )

        self.assertEqual(
            serialize_database([character], []),
            "爱;ai;4;true;;2026-07-12T12:00:00+00:00\n",
        )


if __name__ == "__main__":
    unittest.main()
