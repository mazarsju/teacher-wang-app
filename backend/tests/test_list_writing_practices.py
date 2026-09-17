import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock, patch

import backend.utils.database.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.app import app  # noqa: E402
from auth_stub import TEST_USER_ID, authenticated_client, patch_request_auth  # noqa: E402


class TestListWritingPracticesEndpoint(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)

        self.practice_patcher = patch(
            "backend.routes.list_writing_practices.WritingPractice"
        )
        self.mock_practice_cls = self.practice_patcher.start()
        self.addCleanup(self.practice_patcher.stop)

        self.progress_patcher = patch(
            "backend.routes.list_writing_practices.WritingProgress"
        )
        self.mock_progress_cls = self.progress_patcher.start()
        self.addCleanup(self.progress_patcher.stop)

    def test_list_writing_practices_merges_status(self):
        self.mock_practice_cls.query.all.return_value = [
            MagicMock(
                id="writing-present-yourself",
                title="Present yourself",
                after_grammar_point="1|Basic Sentence Structure",
            ),
        ]
        self.mock_progress_cls.query.filter_by.return_value.all.return_value = [
            MagicMock(writing_topic="writing-present-yourself", status="WIP"),
        ]

        response = self.client.get("/writing-practices")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            {
                "writing_practices": [
                    {
                        "id": "writing-present-yourself",
                        "title": "Present yourself",
                        "after_grammar_point": "1|Basic Sentence Structure",
                        "status": "WIP",
                    },
                ],
            },
        )
        self.mock_progress_cls.query.filter_by.assert_called_once_with(
            user_id=TEST_USER_ID
        )

    def test_list_writing_practices_defaults_status_to_todo(self):
        self.mock_practice_cls.query.all.return_value = [
            MagicMock(
                id="writing-present-yourself",
                title="Present yourself",
                after_grammar_point="1|Basic Sentence Structure",
            ),
        ]
        self.mock_progress_cls.query.filter_by.return_value.all.return_value = []

        response = self.client.get("/writing-practices")

        self.assertEqual(
            response.get_json()["writing_practices"][0]["status"], "TODO"
        )

    def test_list_writing_practices_uses_translated_titles_with_english_fallback(
        self,
    ):
        self.mock_practice_cls.query.all.return_value = [
            MagicMock(
                id="writing-present-yourself",
                title="Present yourself",
                after_grammar_point="1|Basic Sentence Structure",
            ),
        ]
        self.mock_progress_cls.query.filter_by.return_value.all.return_value = []

        with patch(
            "backend.routes.list_writing_practices.current_user",
            return_value=MagicMock(language="fr"),
        ), patch(
            "backend.routes.list_writing_practices.fetch_writing_practice_titles",
            return_value={"writing-present-yourself": "Se présenter"},
        ) as mock_fetch_writing_practice_titles:
            response = self.client.get("/writing-practices")

        mock_fetch_writing_practice_titles.assert_called_once_with("fr")
        self.assertEqual(
            response.get_json()["writing_practices"][0]["title"], "Se présenter"
        )


if __name__ == "__main__":
    unittest.main()
