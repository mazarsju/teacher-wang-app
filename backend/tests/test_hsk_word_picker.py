import bootstrap  # noqa: F401
import unittest

from backend.extensions import db
from backend.hsk_word_picker import pick_next_hsk_word
from backend.models import HskWord, Word
from postgres_test_case import PostgresTestCase


class TestPickNextHskWord(PostgresTestCase):
    def setUp(self):
        super().setUp()
        db.session.add_all(
            [
                HskWord(
                    id="爱|ai4",
                    word="爱",
                    level=1,
                    frequency=10,
                    pinyin="ai4",
                    definition="to love",
                ),
                HskWord(
                    id="爱好|ai4 hao4",
                    word="爱好",
                    level=1,
                    frequency=20,
                    pinyin="ai4 hao4",
                    definition="hobby",
                ),
                HskWord(
                    id="好|hao3",
                    word="好",
                    level=1,
                    frequency=5,
                    pinyin="hao3",
                    definition="good",
                ),
            ]
        )
        db.session.commit()

    def test_picks_the_lowest_frequency_word_first(self):
        word = pick_next_hsk_word(self.user_id)

        self.assertEqual(word.word, "好")

    def test_skips_excluded_words(self):
        word = pick_next_hsk_word(self.user_id, {"好"})

        self.assertEqual(word.word, "爱")

    def test_skips_words_already_in_the_users_knowledge_base(self):
        db.session.add(Word(user_id=self.user_id, word="好", definition="good"))
        db.session.commit()

        word = pick_next_hsk_word(self.user_id)

        self.assertEqual(word.word, "爱")

    def test_returns_none_when_nothing_is_left(self):
        word = pick_next_hsk_word(self.user_id, {"爱", "爱好", "好"})

        self.assertIsNone(word)


if __name__ == "__main__":
    unittest.main()
