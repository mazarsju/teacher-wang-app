import unittest

from backend.pinyin import (
    normalize_anki_pinyin_token,
    replace_pinyin_accents,
)


class PinyinNormalizeTests(unittest.TestCase):
    def test_replace_accent_example_i_tone1(self):
        self.assertEqual(replace_pinyin_accents("Qīn"), "Qin1")
        self.assertEqual(normalize_anki_pinyin_token("Qīn"), "qin1")

    def test_normalize_already_digit_tone(self):
        self.assertEqual(normalize_anki_pinyin_token("ba3"), "ba3")
        self.assertEqual(normalize_anki_pinyin_token("Yi"), "yi")

    def test_normalize_umlaut_suggestion(self):
        self.assertEqual(normalize_anki_pinyin_token("nue3"), "nüe3")

    def test_normalize_invalid_returns_none(self):
        self.assertIsNone(normalize_anki_pinyin_token(""))
        self.assertIsNone(normalize_anki_pinyin_token("xyz9"))


if __name__ == "__main__":
    unittest.main()
