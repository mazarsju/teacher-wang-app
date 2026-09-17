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
        self.mock_point_cls.query.filter_by.return_value.all.return_value = [
            MagicMock(id="1|Basic Sentence Structure", hsk_level=1),
            MagicMock(id="1|Questions with Ma", hsk_level=1),
        ]
        self.mock_prerequisite_cls.query.filter.return_value.all.return_value = [
            MagicMock(
                grammar_id="1|Questions with Ma",
                prerequisite_id="1|Basic Sentence Structure",
            ),
        ]
        self.mock_progress_cls.query.filter_by.return_value.filter.return_value.all.return_value = [
            MagicMock(
                grammar_id="1|Basic Sentence Structure",
                status="DONE",
                score=82,
                usage_in_real_life=1,
            ),
        ]

        response = self.client.get("/grammar-points/1")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            {
                "grammar_points": [
                    {
                        "id": "1|Basic Sentence Structure",
                        "prerequisites": [],
                        "status": "DONE",
                        "score": 82,
                        "usage_count": 1,
                    },
                    {
                        "id": "1|Questions with Ma",
                        "prerequisites": ["1|Basic Sentence Structure"],
                        "status": "TODO",
                        "score": None,
                        "usage_count": 0,
                    },
                ],
            },
        )
        self.mock_point_cls.query.filter_by.assert_called_once_with(hsk_level=1)
        self.mock_progress_cls.query.filter_by.assert_called_once_with(
            user_id=TEST_USER_ID
        )

    def test_list_grammar_points_scopes_to_the_requested_level(self):
        self.mock_point_cls.query.filter_by.return_value.all.return_value = []
        self.mock_prerequisite_cls.query.filter.return_value.all.return_value = []
        self.mock_progress_cls.query.filter_by.return_value.filter.return_value.all.return_value = (
            []
        )

        response = self.client.get("/grammar-points/3")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"grammar_points": []})
        self.mock_point_cls.query.filter_by.assert_called_once_with(hsk_level=3)


if __name__ == "__main__":
    unittest.main()
