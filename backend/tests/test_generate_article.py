import bootstrap  # noqa: F401
import json
import unittest
from unittest.mock import MagicMock, patch

import backend.utils.database.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.app import app  # noqa: E402
from backend.utils.generateArticle.service import (  # noqa: E402
    _fetch_china_articles,
    _fetch_from_currents,
    _fetch_from_guardian,
    run_weekly_article_generation,
)
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

        self.run_patcher = patch(
            "backend.routes.generate_article.run_weekly_article_generation"
        )
        self.mock_run = self.run_patcher.start()
        self.addCleanup(self.run_patcher.stop)

    def test_admin_triggers_weekly_article_generation(self):
        self.mock_run.return_value = {
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
        self.mock_run.assert_called_once_with()

    def test_no_weekly_articles_generated_when_nothing_fetched(self):
        self.mock_run.return_value = None

        response = self.client.post("/admin/articles/generate")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["weekly_articles"], None)

    def test_non_admin_is_forbidden(self):
        self.mock_current_user.return_value = MagicMock(email="someone@example.com")

        response = self.client.post("/admin/articles/generate")

        self.assertEqual(response.status_code, 403)
        self.mock_run.assert_not_called()

    def test_missing_api_key_returns_400(self):
        self.mock_run.side_effect = ValueError(
            "GUARDIAN_API_KEY must be set as an environment variable"
        )

        response = self.client.post("/admin/articles/generate")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.get_json()["error"],
            "GUARDIAN_API_KEY must be set as an environment variable",
        )


class TestRunWeeklyArticleGeneration(unittest.TestCase):
    def test_returns_none_when_fetch_is_empty(self):
        with (
            patch(
                "backend.utils.generateArticle.service._fetch_china_articles",
                return_value=[],
            ),
            patch(
                "backend.utils.generateArticle.service.generate_weekly_articles"
            ) as mock_generate,
        ):
            self.assertIsNone(run_weekly_article_generation())
            mock_generate.assert_not_called()

    def test_passes_fetched_articles_to_pipeline(self):
        fetched = [{"id": "a1", "title": "One"}]
        summary = {"week": 33, "year": 2026, "hsk_levels": [1, 2, 3, 4, 5, 6]}
        with (
            patch(
                "backend.utils.generateArticle.service._fetch_china_articles",
                return_value=fetched,
            ),
            patch(
                "backend.utils.generateArticle.service.generate_weekly_articles",
                return_value=summary,
            ) as mock_generate,
        ):
            self.assertEqual(run_weekly_article_generation(), summary)
            mock_generate.assert_called_once_with(fetched)


class TestArticleSourceDispatch(unittest.TestCase):
    """`_fetch_china_articles` picks a source per the hardcoded `ARTICLE_SOURCE` flag."""

    def test_dispatches_to_guardian_by_default(self):
        with patch(
            "backend.utils.generateArticle.service._fetch_from_guardian"
        ) as mock_guardian:
            mock_guardian.return_value = [{"id": "g1"}]

            self.assertEqual(_fetch_china_articles(), [{"id": "g1"}])
            mock_guardian.assert_called_once_with()

    def test_dispatches_to_currents_when_flag_set(self):
        with patch(
            "backend.utils.generateArticle.service.ARTICLE_SOURCE", "currents"
        ), patch(
            "backend.utils.generateArticle.service._fetch_from_currents"
        ) as mock_currents:
            mock_currents.return_value = [{"id": "c1"}]

            self.assertEqual(_fetch_china_articles(), [{"id": "c1"}])
            mock_currents.assert_called_once_with()


class TestFetchFromCurrents(unittest.TestCase):
    def setUp(self):
        self.read_config_patcher = patch(
            "backend.utils.generateArticle.service.read_config_value"
        )
        self.mock_read_config = self.read_config_patcher.start()
        self.addCleanup(self.read_config_patcher.stop)

    def test_raises_when_api_key_missing(self):
        self.mock_read_config.return_value = ""

        with self.assertRaises(ValueError):
            _fetch_from_currents()

    @patch("backend.utils.generateArticle.service.urlopen")
    def test_reads_api_key_the_same_way_as_llm_api_key(self, mock_urlopen):
        self.mock_read_config.return_value = "test-key"
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps(
            {"news": [{"id": "a1", "title": "One"}]}
        ).encode("utf-8")
        mock_urlopen.return_value.__enter__.return_value = mock_response

        articles = _fetch_from_currents()

        self.assertEqual(articles, [{"id": "a1", "title": "One"}])
        self.mock_read_config.assert_called_once_with("CURRENTS_API_KEY")

        sent_request = mock_urlopen.call_args.args[0]
        self.assertIn("User-agent", sent_request.headers)


class TestFetchFromGuardian(unittest.TestCase):
    def setUp(self):
        self.read_config_patcher = patch(
            "backend.utils.generateArticle.service.read_config_value"
        )
        self.mock_read_config = self.read_config_patcher.start()
        self.addCleanup(self.read_config_patcher.stop)

    def test_raises_when_api_key_missing(self):
        self.mock_read_config.return_value = ""

        with self.assertRaises(ValueError):
            _fetch_from_guardian()

    @patch("backend.utils.generateArticle.service.urlopen")
    def test_reads_api_key_the_same_way_as_currents_api_key(self, mock_urlopen):
        self.mock_read_config.return_value = "test-key"
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps(
            {
                "response": {
                    "results": [
                        {
                            "id": "world/2026/aug/01/china-story",
                            "webTitle": "China story",
                            "sectionName": "World news",
                            "fields": {"trailText": "A short teaser."},
                        }
                    ]
                }
            }
        ).encode("utf-8")
        mock_urlopen.return_value.__enter__.return_value = mock_response

        articles = _fetch_from_guardian()

        self.assertEqual(
            articles,
            [
                {
                    "id": "world/2026/aug/01/china-story",
                    "title": "China story",
                    "description": "A short teaser.",
                    "category": ["World news"],
                }
            ],
        )
        self.mock_read_config.assert_called_once_with("GUARDIAN_API_KEY")

        sent_request = mock_urlopen.call_args.args[0]
        self.assertIn("User-agent", sent_request.headers)

    @patch("backend.utils.generateArticle.service.urlopen")
    def test_defaults_missing_fields(self, mock_urlopen):
        self.mock_read_config.return_value = "test-key"
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps(
            {"response": {"results": [{"id": "a1", "webTitle": "Title only"}]}}
        ).encode("utf-8")
        mock_urlopen.return_value.__enter__.return_value = mock_response

        articles = _fetch_from_guardian()

        self.assertEqual(
            articles,
            [
                {
                    "id": "a1",
                    "title": "Title only",
                    "description": "",
                    "category": [],
                }
            ],
        )


if __name__ == "__main__":
    unittest.main()
