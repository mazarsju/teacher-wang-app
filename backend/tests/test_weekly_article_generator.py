import unittest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from backend.routes.weekly_article_generator import (
    ARTICLE_LENGTH_GUIDELINES,
    _full_length_text,
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


class TestGenerateWeeklyArticles(PostgresTestCase):
    def setUp(self):
        super().setUp()

        self.invoke_patcher = patch(
            "backend.routes.weekly_article_generator._invoke_llm"
        )
        self.mock_invoke = self.invoke_patcher.start()
        self.addCleanup(self.invoke_patcher.stop)
        self.mock_invoke.side_effect = lambda messages: (
            f"adapted:{messages[-1].content}",
            MagicMock(),
        )

        self.articles = [
            {"id": "a1", "title": "Title A", "description": "Desc A"},
            {"id": "a2", "title": "Title B", "description": "Desc B"},
        ]

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

    def test_low_levels_are_adapted_from_the_summary_not_the_full_text(self):
        generate_weekly_articles(self.articles)

        # First _invoke_llm call is the summarization step.
        full_text = self.mock_invoke.call_args_list[0].args[0][-1].content
        self.assertIn("Title A", full_text)
        summarized_text = f"adapted:{full_text}"

        level_1_row = WeeklyArticle.query.filter_by(hsk_level=1).one()
        self.assertEqual(level_1_row.content, f"adapted:{summarized_text}")

        level_3_row = WeeklyArticle.query.filter_by(hsk_level=3).one()
        self.assertEqual(level_3_row.content, f"adapted:{full_text}")

    def test_refresh_overwrites_the_existing_week(self):
        generate_weekly_articles(self.articles)
        first_content = WeeklyArticle.query.filter_by(hsk_level=1).one().content

        self.mock_invoke.side_effect = lambda messages: (
            f"regenerated:{messages[-1].content}",
            MagicMock(),
        )
        generate_weekly_articles(self.articles)

        rows = WeeklyArticle.query.filter_by(hsk_level=1).all()
        self.assertEqual(len(rows), 1)
        self.assertNotEqual(rows[0].content, first_content)


if __name__ == "__main__":
    unittest.main()
