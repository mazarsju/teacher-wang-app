import bootstrap  # noqa: F401
import unittest

from backend.extensions import db
from backend.hsk_word_picker import pick_next_hsk_word
from backend.models import HskWord, Word
from postgres_test_case import PostgresTestCase


def seed_words(user_id, count=20):
    words = [
        HskWord(
            id=f"词{index}|ci{index}",
            word=f"词{index}",
            level=1,
            frequency=index,
            pinyin=f"ci{index}",
            definition=f"definition {index}",
        )
        for index in range(count)
    ]
    db.session.add_all(words)
    db.session.commit()
    return words


class TestPickNextHskWord(PostgresTestCase):
    def setUp(self):
        super().setUp()
        self.words = seed_words(self.user_id)

    def test_initial_pick_returns_the_word_at_the_given_index(self):
        result = pick_next_hsk_word(
            self.user_id,
            decision=None,
            current_index=0,
            previous_index=-1,
            increment=1,
        )

        self.assertEqual(result.next_word.word, "词0")
        self.assertEqual(result.current_index, 0)
        self.assertEqual(result.previous_index, -1)
        self.assertEqual(result.increment, 1)
        self.assertEqual(result.words_between, [])

    def test_can_write_doubles_the_increment_and_jumps_forward(self):
        result = pick_next_hsk_word(
            self.user_id,
            decision="can_write",
            current_index=0,
            previous_index=-1,
            increment=1,
        )

        self.assertEqual(result.increment, 2)
        self.assertEqual(result.previous_index, 0)
        self.assertEqual(result.current_index, 2)
        self.assertEqual(result.next_word.word, "词2")
        self.assertEqual(result.words_between, [])

    def test_can_write_marks_the_skipped_words_as_between(self):
        result = pick_next_hsk_word(
            self.user_id,
            decision="can_write",
            current_index=2,
            previous_index=0,
            increment=2,
        )

        self.assertEqual(result.increment, 4)
        self.assertEqual(result.previous_index, 2)
        self.assertEqual(result.current_index, 6)
        self.assertEqual([word.word for word in result.words_between], ["词1"])

    def test_can_recognize_doubles_increment_while_small(self):
        result = pick_next_hsk_word(
            self.user_id,
            decision="can_recognize",
            current_index=2,
            previous_index=0,
            increment=4,
        )

        self.assertEqual(result.increment, 8)
        self.assertEqual(result.current_index, 10)
        self.assertEqual([word.word for word in result.words_between], ["词1"])

    def test_can_recognize_keeps_increment_once_it_is_large_enough(self):
        result = pick_next_hsk_word(
            self.user_id,
            decision="can_recognize",
            current_index=2,
            previous_index=0,
            increment=16,
        )

        self.assertEqual(result.increment, 16)
        self.assertEqual(result.current_index, 18)

    def test_dont_know_shrinks_increment_and_backtracks_between_the_gap(self):
        result = pick_next_hsk_word(
            self.user_id,
            decision="dont_know",
            current_index=6,
            previous_index=2,
            increment=4,
        )

        self.assertEqual(result.increment, 1)
        self.assertEqual(result.previous_index, 2)
        self.assertEqual(result.current_index, 3)
        self.assertEqual(result.words_between, [])

    def test_dont_know_increment_never_drops_below_one(self):
        result = pick_next_hsk_word(
            self.user_id,
            decision="dont_know",
            current_index=1,
            previous_index=0,
            increment=2,
        )

        self.assertEqual(result.increment, 1)
        self.assertEqual(result.current_index, 1)

    def test_skips_a_word_already_asked_and_advances_to_the_next_in_frequency_order(
        self,
    ):
        result = pick_next_hsk_word(
            self.user_id,
            decision="can_write",
            current_index=0,
            previous_index=-1,
            increment=1,
            exclude_words={"词2"},
        )

        self.assertEqual(result.current_index, 3)
        self.assertEqual(result.next_word.word, "词3")

    def test_words_between_excludes_already_asked_words(self):
        result = pick_next_hsk_word(
            self.user_id,
            decision="can_write",
            current_index=2,
            previous_index=0,
            increment=2,
            exclude_words={"词1"},
        )

        self.assertEqual(result.words_between, [])

    def test_excludes_words_already_in_the_users_knowledge_base(self):
        db.session.add(Word(user_id=self.user_id, word="词0", definition="known"))
        db.session.commit()

        result = pick_next_hsk_word(
            self.user_id,
            decision=None,
            current_index=0,
            previous_index=-1,
            increment=1,
        )

        self.assertEqual(result.next_word.word, "词1")

    def test_returns_none_when_the_index_runs_past_the_end_of_the_list(self):
        result = pick_next_hsk_word(
            self.user_id,
            decision="can_write",
            current_index=18,
            previous_index=17,
            increment=32,
        )

        self.assertIsNone(result.next_word)


class TestPickNextHskWordOrdering(PostgresTestCase):
    def test_orders_by_level_before_frequency(self):
        db.session.add_all(
            [
                HskWord(
                    id="高频二级|gao1",
                    word="高频二级",
                    level=2,
                    frequency=1,
                    pinyin="gao1",
                    definition="high-frequency level 2",
                ),
                HskWord(
                    id="低频一级|di1",
                    word="低频一级",
                    level=1,
                    frequency=99,
                    pinyin="di1",
                    definition="low-frequency level 1",
                ),
            ]
        )
        db.session.commit()

        result = pick_next_hsk_word(
            self.user_id,
            decision=None,
            current_index=0,
            previous_index=-1,
            increment=1,
        )

        # Level 1 word wins even though it has a much higher (worse)
        # frequency than the level 2 word.
        self.assertEqual(result.next_word.word, "低频一级")


if __name__ == "__main__":
    unittest.main()
