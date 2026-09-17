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

        self.translation_patcher = patch(
            "backend.routes.list_grammar_points_light.GrammarPointTranslation"
        )
        self.mock_translation_cls = self.translation_patcher.start()
        self.mock_translation_cls.query.filter_by.return_value.all.return_value = []
        self.addCleanup(self.translation_patcher.stop)

    def test_list_grammar_points_light_orders_by_hsk_level_then_folder_index(self):
        self.mock_point_cls.query.all.return_value = [
            MagicMock(
                id="2|Adverbs",
                hsk_level=2,
                title="Adverbs",
                s3_key="hsk2/01-adverbs",
                index=1,
            ),
            MagicMock(
                id="1|Questions with Ma",
                hsk_level=1,
                title="Questions with Ma",
                s3_key="hsk1/02-questions-with-ma",
                index=2,
            ),
            MagicMock(
                id="1|Basic Sentence Structure",
                hsk_level=1,
                title="Basic Sentence Structure",
                s3_key="hsk1/01-basic-sentence-structure",
                index=1,
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
                index=1,
            ),
        ]

        self.mock_translation_cls.query.filter_by.return_value.all.return_value = [
            MagicMock(
                point_id="1|Basic Sentence Structure",
                translate="Structure de phrase de base",
            ),
        ]

        with patch(
            "backend.routes.list_grammar_points_light.current_user",
            return_value=MagicMock(language="fr"),
        ):
            response = self.client.get("/grammar-points-light")

        self.mock_translation_cls.query.filter_by.assert_called_once_with(
            language="fr"
        )
        self.assertEqual(
            response.get_json()["grammar_points"][0]["title"],
            "Structure de phrase de base",
        )


if __name__ == "__main__":
    unittest.main()
