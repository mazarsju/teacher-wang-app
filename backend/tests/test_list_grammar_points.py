import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock, patch

import backend.utils.database.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.app import app  # noqa: E402
from auth_stub import TEST_USER_ID, authenticated_client, patch_request_auth  # noqa: E402


class TestListGrammarPointsEndpoint(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)

        self.point_patcher = patch(
            "backend.routes.list_grammar_points.GrammarPoint"
        )
        self.mock_point_cls = self.point_patcher.start()
        self.addCleanup(self.point_patcher.stop)

        self.prerequisite_patcher = patch(
            "backend.routes.list_grammar_points.GrammarPrerequisite"
        )
        self.mock_prerequisite_cls = self.prerequisite_patcher.start()
        self.addCleanup(self.prerequisite_patcher.stop)

        self.progress_patcher = patch(
            "backend.routes.list_grammar_points.UserGrammarProgress"
        )
        self.mock_progress_cls = self.progress_patcher.start()
        self.addCleanup(self.progress_patcher.stop)

    def test_list_grammar_points_merges_prerequisites_and_status(self):
        self.mock_point_cls.query.all.return_value = [
            MagicMock(
                id="1|Basic Sentence Structure",
                hsk_level=1,
                title="Basic Sentence Structure",
                s3_key="hsk1/01-basic-sentence-structure",
            ),
            MagicMock(
                id="1|Questions with Ma",
                hsk_level=1,
                title="Questions with Ma",
                s3_key="hsk1/02-questions-with-ma",
            ),
        ]
        self.mock_prerequisite_cls.query.all.return_value = [
            MagicMock(
                grammar_id="1|Questions with Ma",
                prerequisite_id="1|Basic Sentence Structure",
            ),
        ]
        self.mock_progress_cls.query.filter_by.return_value.all.return_value = [
            MagicMock(grammar_id="1|Basic Sentence Structure", status="DONE", score=82),
        ]

        response = self.client.get("/grammar-points")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            [
                {
                    "id": "1|Basic Sentence Structure",
                    "hsk_level": 1,
                    "index": 1,
                    "title": "Basic Sentence Structure",
                    "prerequisites": [],
                    "status": "DONE",
                    "score": 82,
                },
                {
                    "id": "1|Questions with Ma",
                    "hsk_level": 1,
                    "index": 2,
                    "title": "Questions with Ma",
                    "prerequisites": ["1|Basic Sentence Structure"],
                    "status": "TODO",
                    "score": None,
                },
            ],
        )
        self.mock_progress_cls.query.filter_by.assert_called_once_with(
            user_id=TEST_USER_ID
        )

    def test_list_grammar_points_orders_by_hsk_level_then_folder_index(self):
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
                id="1|Adverbs of Degree",
                hsk_level=1,
                title="Adverbs of Degree",
                s3_key="hsk1/10-adverbs-of-degree",
            ),
            MagicMock(
                id="1|Basic Sentence Structure",
                hsk_level=1,
                title="Basic Sentence Structure",
                s3_key="hsk1/01-basic-sentence-structure",
            ),
        ]
        self.mock_prerequisite_cls.query.all.return_value = []
        self.mock_progress_cls.query.filter_by.return_value.all.return_value = []

        response = self.client.get("/grammar-points")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [(item["hsk_level"], item["index"], item["title"]) for item in response.get_json()],
            [
                (1, 1, "Basic Sentence Structure"),
                (1, 2, "Questions with Ma"),
                (1, 10, "Adverbs of Degree"),
                (2, 1, "Adverbs"),
            ],
        )


if __name__ == "__main__":
    unittest.main()
