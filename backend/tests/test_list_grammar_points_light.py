import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock, patch

import backend.utils.database.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.app import app  # noqa: E402
from auth_stub import authenticated_client, patch_request_auth  # noqa: E402


class TestListGrammarPointsLightEndpoint(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)

        self.point_patcher = patch(
            "backend.routes.list_grammar_points_light.GrammarPoint"
        )
        self.mock_point_cls = self.point_patcher.start()
        self.addCleanup(self.point_patcher.stop)

    def test_list_grammar_points_light_orders_by_hsk_level_then_folder_index(self):
        self.mock_point_cls.query.all.return_value = [
            MagicMock(
                id="2|Adverbs",
                hsk_level=2,
                title="Adverbs",
                s3_key="hsk2/01-adverbs",
            ),
            MagicMock(
                id="1|Questions with Ma",
                hsk_level=1,
                title="Questions with Ma",
                s3_key="hsk1/02-questions-with-ma",
            ),
            MagicMock(
                id="1|Basic Sentence Structure",
                hsk_level=1,
                title="Basic Sentence Structure",
                s3_key="hsk1/01-basic-sentence-structure",
            ),
        ]

        response = self.client.get("/grammar-points-light")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            {
                "grammar_points": [
                    {
                        "id": "1|Basic Sentence Structure",
                        "hsk_level": 1,
                        "index": 1,
                        "title": "Basic Sentence Structure",
                    },
                    {
                        "id": "1|Questions with Ma",
                        "hsk_level": 1,
                        "index": 2,
                        "title": "Questions with Ma",
                    },
                    {
                        "id": "2|Adverbs",
                        "hsk_level": 2,
                        "index": 1,
                        "title": "Adverbs",
                    },
                ],
            },
        )

    def test_list_grammar_points_light_uses_translated_titles_with_english_fallback(
        self,
    ):
        self.mock_point_cls.query.all.return_value = [
            MagicMock(
                id="1|Basic Sentence Structure",
                hsk_level=1,
                title="Basic Sentence Structure",
                s3_key="hsk1/01-basic-sentence-structure",
            ),
        ]

        with patch(
            "backend.routes.list_grammar_points_light.current_user",
            return_value=MagicMock(language="fr"),
        ), patch(
            "backend.routes.list_grammar_points_light.fetch_grammar_titles",
            return_value={
                "hsk1/01-basic-sentence-structure": "Structure de phrase de base"
            },
        ) as mock_fetch_grammar_titles:
            response = self.client.get("/grammar-points-light")

        mock_fetch_grammar_titles.assert_called_once_with("fr")
        self.assertEqual(
            response.get_json()["grammar_points"][0]["title"],
            "Structure de phrase de base",
        )


if __name__ == "__main__":
    unittest.main()
