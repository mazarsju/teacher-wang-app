import bootstrap  # noqa: F401
import json
import unittest
from unittest.mock import MagicMock, patch

import backend.utils.database.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.app import app  # noqa: E402
from backend.routes.generate_article import _fetch_china_articles  # noqa: E402
from auth_stub import authenticated_client, patch_request_auth  # noqa: E402


class TestGenerateArticleEndpoint(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)

        self.current_user_patcher = patch(
            "backend.routes.generate_article.current_user"
        )
        self.mock_current_user = self.current_user_patcher.start()
        self.mock_current_user.return_value = MagicMock(email="mazarsju@gmail.com")
        self.addCleanup(self.current_user_patcher.stop)

        self.fetch_patcher = patch(
            "backend.routes.generate_article._fetch_china_articles"
        )
        self.mock_fetch = self.fetch_patcher.start()
        self.addCleanup(self.fetch_patcher.stop)

        self.generate_weekly_patcher = patch(
            "backend.routes.generate_article.generate_weekly_articles"
        )
        self.mock_generate_weekly = self.generate_weekly_patcher.start()
        self.addCleanup(self.generate_weekly_patcher.stop)

    def test_admin_triggers_weekly_article_generation(self):
        fetched_articles = [
            {"id": "a1", "title": "One"},
            {"id": "a2", "title": "Two"},
        ]
        self.mock_fetch.return_value = fetched_articles
        self.mock_generate_weekly.return_value = {
            "week": 33,
            "year": 2026,
            "hsk_levels": [1, 2, 3, 4, 5, 6],
        }

        response = self.client.post("/admin/articles/generate")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            {
                "weekly_articles": {
                    "week": 33,
                    "year": 2026,
                    "hsk_levels": [1, 2, 3, 4, 5, 6],
                }
            },
        )
        self.mock_generate_weekly.assert_called_once_with(fetched_articles)

    def test_no_weekly_articles_generated_when_nothing_fetched(self):
        self.mock_fetch.return_value = []

        response = self.client.post("/admin/articles/generate")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["weekly_articles"], None)
        self.mock_generate_weekly.assert_not_called()

    def test_non_admin_is_forbidden(self):
        self.mock_current_user.return_value = MagicMock(email="someone@example.com")

        response = self.client.post("/admin/articles/generate")

        self.assertEqual(response.status_code, 403)
        self.mock_fetch.assert_not_called()

    def test_missing_api_key_returns_400(self):
        self.mock_fetch.side_effect = ValueError(
            "CURRENTS_API_KEY must be set as an environment variable"
        )

        response = self.client.post("/admin/articles/generate")

        self.assertEqual(response.status_code, 400)
        self.mock_generate_weekly.assert_not_called()


class TestFetchChinaArticles(unittest.TestCase):
    def setUp(self):
        self.read_config_patcher = patch(
            "backend.routes.generate_article.read_config_value"
        )
        self.mock_read_config = self.read_config_patcher.start()
        self.addCleanup(self.read_config_patcher.stop)

    def test_raises_when_api_key_missing(self):
        self.mock_read_config.return_value = ""

        with self.assertRaises(ValueError):
            _fetch_china_articles()

    @patch("backend.routes.generate_article.urlopen")
    def test_reads_api_key_the_same_way_as_llm_api_key(self, mock_urlopen):
        self.mock_read_config.return_value = "test-key"
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps(
            {"news": [{"id": "a1", "title": "One"}]}
        ).encode("utf-8")
        mock_urlopen.return_value.__enter__.return_value = mock_response

        articles = _fetch_china_articles()

        self.assertEqual(articles, [{"id": "a1", "title": "One"}])
        self.mock_read_config.assert_called_once_with("CURRENTS_API_KEY")

        sent_request = mock_urlopen.call_args.args[0]
        self.assertIn("User-agent", sent_request.headers)


if __name__ == "__main__":
    unittest.main()
