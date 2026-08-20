import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock, patch

from backend.jobs.generate_weekly_articles import main


class TestGenerateWeeklyArticlesJob(unittest.TestCase):
    def test_runs_generation_inside_app_context(self):
        mock_app = MagicMock()
        mock_app.app_context.return_value.__enter__.return_value = None
        mock_app.app_context.return_value.__exit__.return_value = None
        summary = {"week": 33, "year": 2026, "hsk_levels": [1, 2, 3, 4, 5, 6]}

        with (
            patch(
                "backend.jobs.generate_weekly_articles.create_app",
                return_value=mock_app,
            ),
            patch(
                "backend.jobs.generate_weekly_articles.run_weekly_article_generation",
                return_value=summary,
            ) as mock_run,
        ):
            main()

        mock_app.app_context.assert_called_once()
        mock_run.assert_called_once_with()


if __name__ == "__main__":
    unittest.main()
