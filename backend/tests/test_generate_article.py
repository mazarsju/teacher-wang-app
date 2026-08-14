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

        self.invoke_patcher = patch("backend.routes.generate_article._invoke_llm")
        self.mock_invoke = self.invoke_patcher.start()
        self.addCleanup(self.invoke_patcher.stop)

    def test_admin_gets_top_articles_picked_by_llm(self):
        self.mock_fetch.return_value = [
            {"id": "a1", "title": "One"},
            {"id": "a2", "title": "Two"},
            {"id": "a3", "title": "Three"},
            {"id": "a4", "title": "Four"},
        ]
        self.mock_invoke.return_value = (
            '{"selected_ids": ["a3", "a1", "a4"]}',
            MagicMock(),
        )

        response = self.client.post("/admin/articles/generate")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [article["id"] for article in response.get_json()["articles"]],
            ["a3", "a1", "a4"],
        )

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
        self.mock_invoke.assert_not_called()


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


if __name__ == "__main__":
    unittest.main()
