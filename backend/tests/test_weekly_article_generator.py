import json
import unittest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from backend.routes.weekly_article_generator import (
    ARTICLE_LENGTH_GUIDELINES,
    ARTICLE_SUMMARY_SYSTEM_PROMPT,
    _full_length_text,
    _inject_new_words,
    _normalize_article,
    generate_weekly_articles,
)
from backend.utils.database.models import WeeklyArticle
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


class TestNormalizeArticle(unittest.TestCase):
    RAW_ARTICLE = {
        "title": "Title",
        "content": "Content",
        "translation": "Translation",
        "pinyin": "Pinyin",
        "extra": "should be dropped",
    }

    def test_keeps_translation_and_pinyin_for_hsk1_and_hsk2(self):
        for level in (1, 2):
            self.assertEqual(
                _normalize_article(self.RAW_ARTICLE, level),
                {
                    "title": "Title",
                    "content": "Content",
                    "translation": "Translation",
                    "pinyin": "Pinyin",
                },
            )

    def test_keeps_only_translation_for_hsk3(self):
        self.assertEqual(
            _normalize_article(self.RAW_ARTICLE, 3),
            {"title": "Title", "content": "Content", "translation": "Translation"},
        )

    def test_drops_translation_and_pinyin_for_hsk4_to_6(self):
        for level in (4, 5, 6):
            self.assertEqual(
                _normalize_article(self.RAW_ARTICLE, level),
                {"title": "Title", "content": "Content"},
            )

    def test_missing_optional_fields_are_omitted_even_when_allowed(self):
        self.assertEqual(
            _normalize_article({"title": "Title", "content": "Content"}, 1),
            {"title": "Title", "content": "Content"},
        )


class TestInjectNewWords(unittest.TestCase):
    def setUp(self):
        self.invoke_patcher = patch(
            "backend.routes.weekly_article_generator._invoke_llm"
        )
        self.mock_invoke = self.invoke_patcher.start()
        self.addCleanup(self.invoke_patcher.stop)

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


def _fake_llm_response(messages, *, marker: str, article_count: int):
    system_content = messages[0].content
    human_content = messages[-1].content

    if system_content == ARTICLE_SUMMARY_SYSTEM_PROMPT:
        return f"{marker}-summary:{human_content}", MagicMock()

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
                {"word": f"{marker}-word-{index}", "translation": f"{marker}-meaning-{index}"}
            ]
        }
        for index in range(article_count)
    ]
    return json.dumps({"articles": articles}), MagicMock()


class TestGenerateWeeklyArticles(PostgresTestCase):
    def setUp(self):
        super().setUp()

        self.invoke_patcher = patch(
            "backend.routes.weekly_article_generator._invoke_llm"
        )
        self.mock_invoke = self.invoke_patcher.start()
        self.addCleanup(self.invoke_patcher.stop)

        self.articles = [
            {"id": "a1", "title": "Title A", "description": "Desc A"},
            {"id": "a2", "title": "Title B", "description": "Desc B"},
        ]
        self.mock_invoke.side_effect = lambda messages: _fake_llm_response(
            messages, marker="v1", article_count=len(self.articles)
        )

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

    def test_low_levels_are_adapted_from_the_summary_not_the_full_text(self):
        generate_weekly_articles(self.articles)

        call_args = self.mock_invoke.call_args_list
        # First call is the summarization step.
        full_text = call_args[0].args[0][-1].content
        self.assertIn("Title A", full_text)

        adaptation_calls = [
            call
            for call in call_args
            if "adapting China-related news articles" in call.args[0][0].content
        ]
        level_1_source = adaptation_calls[0].args[0][-1].content
        self.assertEqual(level_1_source, f"v1-summary:{full_text}")

        level_3_source = adaptation_calls[2].args[0][-1].content
        self.assertEqual(level_3_source, full_text)

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

    def test_refresh_overwrites_the_existing_week(self):
        generate_weekly_articles(self.articles)
        first_content = WeeklyArticle.query.filter_by(hsk_level=1).one().content

        self.mock_invoke.side_effect = lambda messages: _fake_llm_response(
            messages, marker="v2", article_count=len(self.articles)
        )
        generate_weekly_articles(self.articles)

        rows = WeeklyArticle.query.filter_by(hsk_level=1).all()
        self.assertEqual(len(rows), 1)
        self.assertNotEqual(rows[0].content, first_content)
        self.assertEqual(rows[0].content[0]["title"], "v2-title-0")


if __name__ == "__main__":
    unittest.main()
