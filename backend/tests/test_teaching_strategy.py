import bootstrap  # noqa: F401
import unittest

from backend.teaching_strategy import TEACHING_STRATEGIES, get_teaching_strategy


class TestGetTeachingStrategy(unittest.TestCase):
    def test_returns_strategy_matching_level(self):
        for level in range(1, 8):
            self.assertEqual(get_teaching_strategy(level).hsk_level, level)

    def test_clamps_below_minimum_level(self):
        self.assertEqual(get_teaching_strategy(0), TEACHING_STRATEGIES[1])
        self.assertEqual(get_teaching_strategy(-5), TEACHING_STRATEGIES[1])

    def test_clamps_above_maximum_level(self):
        self.assertEqual(get_teaching_strategy(9), TEACHING_STRATEGIES[7])

    def test_as_instructions_includes_level_and_directives(self):
        instructions = get_teaching_strategy(1).as_instructions()
        self.assertIn("HSK 1", instructions)
        self.assertIn("Guided discovery", instructions)
        self.assertIn("Always provide pinyin.", instructions)
        self.assertIn("Introduce at most 1 new word(s) per turn.", instructions)

    def test_as_instructions_omits_new_word_cap_when_unset(self):
        instructions = get_teaching_strategy(3).as_instructions()
        self.assertNotIn("new word(s) per turn", instructions)


if __name__ == "__main__":
    unittest.main()
