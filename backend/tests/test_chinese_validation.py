import bootstrap  # noqa: F401
import unittest

from backend.utils.knowledgeBase.chinese_validation import extract_han_characters, is_han_character


class TestChineseValidation(unittest.TestCase):
    def test_is_han_character(self):
        self.assertTrue(is_han_character("爱"))
        self.assertFalse(is_han_character("a"))
        self.assertFalse(is_han_character("爱好"))

    def test_extract_han_characters(self):
        self.assertEqual(extract_han_characters("Hello 爱好!"), {"爱", "好"})
        self.assertEqual(extract_han_characters("abc"), set())


if __name__ == "__main__":
    unittest.main()
