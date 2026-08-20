import bootstrap  # noqa: F401
import unittest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import backend.utils.database.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.app import app  # noqa: E402
from auth_stub import TEST_USER_ID, authenticated_client, patch_request_auth  # noqa: E402


class TestGetWeeklyArticleEndpoint(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)

        self.level_patcher = patch(
            "backend.routes.weekly_articles.get_stored_current_hsk_level"
        )
        self.mock_get_level = self.level_patcher.start()
        self.addCleanup(self.level_patcher.stop)

        self.article_patcher = patch("backend.routes.weekly_articles.WeeklyArticle")
        self.mock_article_cls = self.article_patcher.start()
        self.addCleanup(self.article_patcher.stop)
        self.scoped_query = self.mock_article_cls.query.filter_by.return_value

        self.iso_year, self.iso_week, _ = datetime.now(timezone.utc).isocalendar()

    def test_returns_the_article_for_the_user_s_stored_hsk_level(self):
        self.mock_get_level.return_value = 3
        content = [
            {
                "title": "Title",
                "content": "Reading material",
                "translation": "Translation",
            }
        ]
        self.scoped_query.one_or_none.return_value = MagicMock(content=content)

        response = self.client.get("/weekly-articles")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            {
                "week": self.iso_week,
                "year": self.iso_year,
                "hsk_level": 4,
                "content": content,
            },
        )
        self.mock_get_level.assert_called_once_with(TEST_USER_ID)
        self.mock_article_cls.query.filter_by.assert_called_once_with(
            week=self.iso_week, year=self.iso_year, hsk_level=4
        )

    def test_defaults_to_hsk_1_when_no_level_is_stored(self):
        self.mock_get_level.return_value = None
        self.scoped_query.one_or_none.return_value = None

        response = self.client.get("/weekly-articles")

        self.assertEqual(response.get_json()["hsk_level"], 1)
        self.assertIsNone(response.get_json()["content"])

    def test_clamps_levels_above_6_down_to_6(self):
        self.mock_get_level.return_value = 7
        self.scoped_query.one_or_none.return_value = None

        response = self.client.get("/weekly-articles")

        self.assertEqual(response.get_json()["hsk_level"], 6)

    def test_returns_null_content_when_nothing_generated_yet(self):
        self.mock_get_level.return_value = 2
        self.scoped_query.one_or_none.return_value = None

        response = self.client.get("/weekly-articles")

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.get_json()["content"])
        self.assertEqual(response.get_json()["hsk_level"], 3)


if __name__ == "__main__":
    unittest.main()
