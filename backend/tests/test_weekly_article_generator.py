import json
import unittest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from backend.utils.generateArticle.weekly_article_generator import (
    ARTICLE_LENGTH_GUIDELINES,
    _content_adaptation_instructions,
    _full_length_text,
    _inject_new_words,
    _known_hsk_words,
    _measure_words_instruction,
    _normalize_article,
    _pick_articles_for_level,
    generate_weekly_articles,
)
from backend.utils.database.extensions import db
from backend.utils.database.models import HskWord, WeeklyArticle
from postgres_test_case import PostgresTestCase


class TestFullLengthText(unittest.TestCase):
    def test_joins_title_and_description_per_article(self):
        text = _full_length_text(
            [
                {"title": "Title A", "description": "Desc A"},
                {"title": "Title B", "description": "Desc B"},
            ]
        )

        self.assertEqual(text, "Title A\nDesc A\n\nTitle B\nDesc B")


class TestArticleLengthGuidelines(unittest.TestCase):
    def test_has_a_guideline_for_every_hsk_level(self):
        self.assertEqual(set(ARTICLE_LENGTH_GUIDELINES.keys()), {1, 2, 3, 4, 5, 6})


class TestMeasureWordsInstruction(unittest.TestCase):
    def test_empty_for_levels_beyond_hsk4(self):
        self.assertEqual(_measure_words_instruction(5), "")
        self.assertEqual(_measure_words_instruction(6), "")

    def test_hsk1_only_lists_hsk1_words(self):
        instruction = _measure_words_instruction(1)

        self.assertIn("个 (gè)", instruction)
        self.assertNotIn("件 (jiàn)", instruction)  # HSK2

    def test_is_cumulative_up_to_the_level(self):
        instruction = _measure_words_instruction(3)

        self.assertIn("个 (gè)", instruction)  # HSK1
        self.assertIn("件 (jiàn)", instruction)  # HSK2
        self.assertIn("张 (zhāng)", instruction)  # HSK3
        self.assertNotIn("座 (zuò)", instruction)  # HSK4, not yet

    def test_adaptation_instructions_include_measure_words_for_hsk1_to_4(self):
        for level in (1, 2, 3, 4):
            self.assertIn("量词", _content_adaptation_instructions(level))

    def test_adaptation_instructions_omit_measure_words_beyond_hsk4(self):
        for level in (5, 6):
            self.assertNotIn("量词", _content_adaptation_instructions(level))


class TestKnownHskWords(PostgresTestCase):
    def setUp(self):
        super().setUp()
        db.session.add_all(
            [
                HskWord(
                    id="熊猫|xiongmao",
                    word="熊猫",
                    level=1,
                    frequency=1,
                    pinyin="xiongmao",
                    definition="panda",
                ),
                HskWord(
                    id="长城|changcheng",
                    word="长城",
                    level=3,
                    frequency=1,
                    pinyin="changcheng",
                    definition="Great Wall",
                ),
            ]
        )
        db.session.commit()

    def test_returns_words_at_or_below_the_target_level(self):
        result = _known_hsk_words({"熊猫", "长城", "外交"}, hsk_level=2)

        self.assertEqual(result, {"熊猫"})

    def test_includes_words_exactly_at_the_target_level(self):
        result = _known_hsk_words({"长城"}, hsk_level=3)

        self.assertEqual(result, {"长城"})

    def test_returns_empty_set_for_empty_input(self):
        self.assertEqual(_known_hsk_words(set(), hsk_level=6), set())

    def test_ignores_words_not_in_hsk_words(self):
        self.assertEqual(_known_hsk_words({"外交"}, hsk_level=6), set())


class TestPickArticlesForLevel(unittest.TestCase):
    def setUp(self):
        self.invoke_patcher = patch(
            "backend.utils.generateArticle.weekly_article_generator._invoke_llm"
        )
        self.mock_invoke = self.invoke_patcher.start()
        self.addCleanup(self.invoke_patcher.stop)
        self.articles = [
            {"id": "a1", "title": "China wins gold in swimming"},
            {"id": "a2", "title": "New tax policy reshapes trade relations"},
            {"id": "a3", "title": "New panda born at Beijing zoo"},
        ]

    def test_returns_empty_list_when_no_articles(self):
        result = _pick_articles_for_level([], hsk_level=1)

        self.assertEqual(result, [])
        self.mock_invoke.assert_not_called()

    def test_picks_articles_selected_by_the_llm_in_order(self):
        self.mock_invoke.return_value = (
            '{"selected_ids": ["a3", "a1"]}',
            MagicMock(),
        )

        result = _pick_articles_for_level(self.articles, hsk_level=1)

        self.assertEqual([article["id"] for article in result], ["a3", "a1"])

    def test_prompt_targets_the_level_and_count_using_titles_only(self):
        self.mock_invoke.return_value = ('{"selected_ids": []}', MagicMock())

        _pick_articles_for_level(self.articles, hsk_level=5, count=2)

        system_content = self.mock_invoke.call_args.args[0][0].content
        human_content = self.mock_invoke.call_args.args[0][-1].content
        self.assertIn("HSK 5", system_content)
        self.assertIn("2 articles", system_content)
        self.assertIn("China wins gold in swimming", human_content)

    def test_ignores_ids_not_in_the_pool(self):
        self.mock_invoke.return_value = (
            '{"selected_ids": ["unknown", "a2"]}',
            MagicMock(),
        )

        result = _pick_articles_for_level(self.articles, hsk_level=3)

        self.assertEqual([article["id"] for article in result], ["a2"])

    def test_truncates_to_count(self):
        self.mock_invoke.return_value = (
            '{"selected_ids": ["a1", "a2", "a3"]}',
            MagicMock(),
        )

        result = _pick_articles_for_level(self.articles, hsk_level=1, count=2)

        self.assertEqual(len(result), 2)


class TestNormalizeArticle(unittest.TestCase):
    RAW_ARTICLE = {
        "title": "Title",
        "content": "Content",
        "translation": "Translation",
        "pinyin": "Pinyin",
        "extra": "should be dropped",
    }
    SOURCE = {"id": "a1", "category": ["technology", "china"]}

    def test_keeps_translation_and_pinyin_for_hsk1_and_hsk2(self):
        for level in (1, 2):
            self.assertEqual(
                _normalize_article(self.RAW_ARTICLE, level, self.SOURCE),
                {
                    "title": "Title",
                    "content": "Content",
                    "category": ["technology", "china"],
                    "translation": "Translation",
                    "pinyin": "Pinyin",
                },
            )

    def test_keeps_only_translation_for_hsk3(self):
        self.assertEqual(
            _normalize_article(self.RAW_ARTICLE, 3, self.SOURCE),
            {
                "title": "Title",
                "content": "Content",
                "category": ["technology", "china"],
                "translation": "Translation",
            },
        )

    def test_drops_translation_and_pinyin_for_hsk4_to_6(self):
        for level in (4, 5, 6):
            self.assertEqual(
                _normalize_article(self.RAW_ARTICLE, level, self.SOURCE),
                {
                    "title": "Title",
                    "content": "Content",
                    "category": ["technology", "china"],
                },
            )

    def test_missing_optional_fields_are_omitted_even_when_allowed(self):
        self.assertEqual(
            _normalize_article({"title": "Title", "content": "Content"}, 1, {}),
            {"title": "Title", "content": "Content"},
        )

    def test_category_omitted_when_source_has_none(self):
        self.assertEqual(
            _normalize_article(self.RAW_ARTICLE, 4, {"id": "a1"}),
            {"title": "Title", "content": "Content"},
        )


class TestInjectNewWords(unittest.TestCase):
    def setUp(self):
        self.invoke_patcher = patch(
            "backend.utils.generateArticle.weekly_article_generator._invoke_llm"
        )
        self.mock_invoke = self.invoke_patcher.start()
        self.addCleanup(self.invoke_patcher.stop)

        self.known_words_patcher = patch(
            "backend.utils.generateArticle.weekly_article_generator._known_hsk_words"
        )
        self.mock_known_words = self.known_words_patcher.start()
        self.addCleanup(self.known_words_patcher.stop)
        self.mock_known_words.return_value = set()

    def test_drops_words_already_in_hsk_words_at_or_below_the_level(self):
        self.mock_invoke.return_value = (
            json.dumps(
                {
                    "articles": [
                        {
                            "new_words": [
                                {"word": "长城", "translation": "Great Wall"},
                                {"word": "熊猫", "translation": "panda"},
                            ]
                        }
                    ]
                }
            ),
            MagicMock(),
        )
        self.mock_known_words.return_value = {"熊猫"}
        content = [{"title": "T1", "content": "C1"}]

        result = _inject_new_words(content, hsk_level=3)

        self.assertEqual(
            result[0]["new_words"],
            [{"word": "长城", "translation": "Great Wall"}],
        )
        self.mock_known_words.assert_called_once_with({"长城", "熊猫"}, 3)

    def test_omits_new_words_field_when_every_word_is_already_known(self):
        self.mock_invoke.return_value = (
            json.dumps(
                {"articles": [{"new_words": [{"word": "熊猫", "translation": "panda"}]}]}
            ),
            MagicMock(),
        )
        self.mock_known_words.return_value = {"熊猫"}
        content = [{"title": "T", "content": "C"}]

        result = _inject_new_words(content, hsk_level=1)

        self.assertNotIn("new_words", result[0])

    def test_merges_new_words_into_matching_articles(self):
        self.mock_invoke.return_value = (
            json.dumps(
                {
                    "articles": [
                        {
                            "new_words": [
                                {"word": "长城", "translation": "Great Wall"}
                            ]
                        },
                        {"new_words": []},
                    ]
                }
            ),
            MagicMock(),
        )
        content = [
            {"title": "T1", "content": "C1"},
            {"title": "T2", "content": "C2"},
        ]

        result = _inject_new_words(content, hsk_level=2)

        self.assertEqual(
            result[0]["new_words"],
            [{"word": "长城", "translation": "Great Wall"}],
        )
        self.assertNotIn("new_words", result[1])

    def test_drops_entries_missing_a_word(self):
        self.mock_invoke.return_value = (
            json.dumps({"articles": [{"new_words": [{"translation": "no word"}]}]}),
            MagicMock(),
        )
        content = [{"title": "T", "content": "C"}]

        result = _inject_new_words(content, hsk_level=1)

        self.assertNotIn("new_words", result[0])

    def test_returns_content_unchanged_when_empty(self):
        result = _inject_new_words([], hsk_level=1)

        self.assertEqual(result, [])
        self.mock_invoke.assert_not_called()


class TestGenerateWeeklyArticles(PostgresTestCase):
    """End-to-end: pick -> adapt -> (new words) -> persist, per HSK level."""

    def setUp(self):
        super().setUp()

        self.invoke_patcher = patch(
            "backend.utils.generateArticle.weekly_article_generator._invoke_llm"
        )
        self.mock_invoke = self.invoke_patcher.start()
        self.addCleanup(self.invoke_patcher.stop)

        self.articles = [
            {
                "id": "a1",
                "title": "Title A",
                "description": "Desc A",
                "category": ["sports"],
            },
            {"id": "a2", "title": "Title B", "description": "Desc B"},
        ]
        self.marker = "v1"
        self.mock_invoke.side_effect = self._fake_invoke

    def _fake_invoke(self, messages):
        system_content = messages[0].content
        marker = self.marker

        if "picking China-related news articles" in system_content:
            selected_ids = [article["id"] for article in self.articles]
            return json.dumps({"selected_ids": selected_ids}), MagicMock()

        article_count = len(self.articles)

        if "adapting China-related news articles" in system_content:
            articles = [
                {
                    "title": f"{marker}-title-{index}",
                    "content": f"{marker}-content-{index}",
                    "translation": f"{marker}-translation-{index}",
                    "pinyin": f"{marker}-pinyin-{index}",
                }
                for index in range(article_count)
            ]
            return json.dumps({"articles": articles}), MagicMock()

        # "new words" injection step.
        articles = [
            {
                "new_words": [
                    {
                        "word": f"{marker}-word-{index}",
                        "translation": f"{marker}-meaning-{index}",
                    }
                ]
            }
            for index in range(article_count)
        ]
        return json.dumps({"articles": articles}), MagicMock()

    def test_saves_one_row_per_hsk_level(self):
        result = generate_weekly_articles(self.articles)

        rows = WeeklyArticle.query.order_by(WeeklyArticle.hsk_level).all()
        self.assertEqual([row.hsk_level for row in rows], [1, 2, 3, 4, 5, 6])
        self.assertEqual(result["hsk_levels"], [1, 2, 3, 4, 5, 6])

    def test_matches_current_iso_week_and_year(self):
        expected_year, expected_week, _ = datetime.now(timezone.utc).isocalendar()

        result = generate_weekly_articles(self.articles)

        self.assertEqual(result["week"], expected_week)
        self.assertEqual(result["year"], expected_year)
        row = WeeklyArticle.query.filter_by(hsk_level=1).one()
        self.assertEqual(row.week, expected_week)
        self.assertEqual(row.year, expected_year)

    def test_content_is_a_list_of_article_objects(self):
        generate_weekly_articles(self.articles)

        row = WeeklyArticle.query.filter_by(hsk_level=1).one()
        self.assertEqual(len(row.content), len(self.articles))
        self.assertEqual(row.content[0]["title"], "v1-title-0")
        self.assertEqual(row.content[0]["content"], "v1-content-0")

    def test_category_is_carried_over_from_the_source_article(self):
        generate_weekly_articles(self.articles)

        row = WeeklyArticle.query.filter_by(hsk_level=1).one()
        self.assertEqual(row.content[0]["category"], ["sports"])
        self.assertNotIn("category", row.content[1])

    def test_translation_and_pinyin_present_only_for_allowed_levels(self):
        generate_weekly_articles(self.articles)

        rows = {row.hsk_level: row.content for row in WeeklyArticle.query.all()}

        for level in (1, 2):
            for article in rows[level]:
                self.assertIn("translation", article)
                self.assertIn("pinyin", article)

        self.assertIn("translation", rows[3][0])
        self.assertNotIn("pinyin", rows[3][0])

        for level in (4, 5, 6):
            for article in rows[level]:
                self.assertNotIn("translation", article)
                self.assertNotIn("pinyin", article)
                self.assertIn("title", article)
                self.assertIn("content", article)

    def test_new_words_present_only_for_hsk1_to_4(self):
        generate_weekly_articles(self.articles)

        rows = {row.hsk_level: row.content for row in WeeklyArticle.query.all()}

        for level in (1, 2, 3, 4):
            for index, article in enumerate(rows[level]):
                self.assertEqual(
                    article["new_words"],
                    [{"word": f"v1-word-{index}", "translation": f"v1-meaning-{index}"}],
                )

        for level in (5, 6):
            for article in rows[level]:
                self.assertNotIn("new_words", article)

    def test_each_level_asks_the_picker_for_its_own_level(self):
        generate_weekly_articles(self.articles)

        picker_calls = [
            call
            for call in self.mock_invoke.call_args_list
            if "picking China-related news articles" in call.args[0][0].content
        ]
        levels_requested = [
            level
            for level in range(1, 7)
            if any(
                f"HSK {level}" in call.args[0][0].content for call in picker_calls
            )
        ]
        self.assertEqual(len(picker_calls), 6)
        self.assertEqual(levels_requested, [1, 2, 3, 4, 5, 6])

    def test_refresh_overwrites_the_existing_week(self):
        generate_weekly_articles(self.articles)
        first_content = WeeklyArticle.query.filter_by(hsk_level=1).one().content

        self.marker = "v2"
        generate_weekly_articles(self.articles)

        rows = WeeklyArticle.query.filter_by(hsk_level=1).all()
        self.assertEqual(len(rows), 1)
        self.assertNotEqual(rows[0].content, first_content)
        self.assertEqual(rows[0].content[0]["title"], "v2-title-0")


if __name__ == "__main__":
    unittest.main()
