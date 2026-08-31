import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock, patch

import backend.utils.database.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.app import app  # noqa: E402
from auth_stub import TEST_USER_ID, authenticated_client, patch_request_auth  # noqa: E402


class TestGetGrammarPointEndpoint(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)

        self.point_patcher = patch("backend.routes.get_grammar_point.GrammarPoint")
        self.mock_point_cls = self.point_patcher.start()
        self.addCleanup(self.point_patcher.stop)

        self.prerequisite_patcher = patch(
            "backend.routes.get_grammar_point.GrammarPrerequisite"
        )
        self.mock_prerequisite_cls = self.prerequisite_patcher.start()
        self.addCleanup(self.prerequisite_patcher.stop)

        self.progress_patcher = patch(
            "backend.routes.get_grammar_point.UserGrammarProgress"
        )
        self.mock_progress_cls = self.progress_patcher.start()
        self.addCleanup(self.progress_patcher.stop)

        self.fetch_content_patcher = patch(
            "backend.routes.get_grammar_point.fetch_grammar_content"
        )
        self.mock_fetch_content = self.fetch_content_patcher.start()
        self.addCleanup(self.fetch_content_patcher.stop)

        self.hsk_word_patcher = patch("backend.routes.get_grammar_point.HskWord")
        self.mock_hsk_word_cls = self.hsk_word_patcher.start()
        self.addCleanup(self.hsk_word_patcher.stop)
        self.mock_hsk_word_cls.query.filter.return_value.order_by.return_value.all.return_value = (
            []
        )

    def test_returns_grammar_point_with_content(self):
        self.mock_point_cls.query.get.return_value = MagicMock(
            id="1|Basic Sentence Structure",
            hsk_level=1,
            title="Basic Sentence Structure",
            s3_key="hsk1/01-basic-sentence-structure",
            new_words=["我", "你"],
        )
        self.mock_prerequisite_cls.query.filter_by.return_value.all.return_value = []
        self.mock_progress_cls.query.filter_by.return_value.first.return_value = (
            MagicMock(status="DONE")
        )
        self.mock_hsk_word_cls.query.filter.return_value.order_by.return_value.all.return_value = [
            MagicMock(
                id="我|wo3", word="我", level=1, frequency=5, pinyin="wǒ", definition="I; me"
            ),
            MagicMock(
                id="你|ni3", word="你", level=1, frequency=8, pinyin="nǐ", definition="you"
            ),
        ]
        exercise = {"id": "mcq_001", "type": "multiple_choice"}
        self.mock_fetch_content.return_value = {
            "explanation": "# Basic Sentence Structure\n\nSubject + Verb + Object.",
            "exercises": [exercise, exercise],
        }

        response = self.client.get(
            "/grammar-points/1%7CBasic%20Sentence%20Structure"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            {
                "id": "1|Basic Sentence Structure",
                "hsk_level": 1,
                "title": "Basic Sentence Structure",
                "prerequisites": [],
                "new_words": [
                    {
                        "id": "我|wo3",
                        "word": "我",
                        "level": 1,
                        "frequency": 5,
                        "pinyin": "wǒ",
                        "definition": "I; me",
                    },
                    {
                        "id": "你|ni3",
                        "word": "你",
                        "level": 1,
                        "frequency": 8,
                        "pinyin": "nǐ",
                        "definition": "you",
                    },
                ],
                "status": "DONE",
                "explanation": "# Basic Sentence Structure\n\nSubject + Verb + Object.",
                "exercises": [exercise],
            },
        )
        self.mock_fetch_content.assert_called_once_with(
            "hsk1/01-basic-sentence-structure", "en"
        )
        self.mock_progress_cls.query.filter_by.assert_called_once_with(
            user_id=TEST_USER_ID, grammar_id="1|Basic Sentence Structure"
        )

    def test_passes_user_language_to_fetch_content(self):
        with patch(
            "backend.routes.get_grammar_point.current_user",
            return_value=MagicMock(id=TEST_USER_ID, language="fr"),
        ):
            self.mock_point_cls.query.get.return_value = MagicMock(
                id="1|Basic Sentence Structure",
                hsk_level=1,
                title="Basic Sentence Structure",
                s3_key="hsk1/01-basic-sentence-structure",
                new_words=None,
            )
            self.mock_prerequisite_cls.query.filter_by.return_value.all.return_value = (
                []
            )
            self.mock_progress_cls.query.filter_by.return_value.first.return_value = (
                None
            )
            self.mock_fetch_content.return_value = {
                "explanation": None,
                "exercises": None,
            }

            self.client.get("/grammar-points/1%7CBasic%20Sentence%20Structure")

            self.mock_fetch_content.assert_called_once_with(
                "hsk1/01-basic-sentence-structure", "fr"
            )

    def test_defaults_status_to_todo_when_no_progress_row(self):
        self.mock_point_cls.query.get.return_value = MagicMock(
            id="1|Basic Sentence Structure",
            hsk_level=1,
            title="Basic Sentence Structure",
            s3_key="hsk1/01-basic-sentence-structure",
            new_words=None,
        )
        self.mock_prerequisite_cls.query.filter_by.return_value.all.return_value = []
        self.mock_progress_cls.query.filter_by.return_value.first.return_value = None
        self.mock_fetch_content.return_value = {"explanation": None, "exercises": None}

        response = self.client.get(
            "/grammar-points/1%7CBasic%20Sentence%20Structure"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["status"], "TODO")

    def test_picks_one_exercise_from_each_consecutive_pair(self):
        self.mock_point_cls.query.get.return_value = MagicMock(
            id="1|Basic Sentence Structure",
            hsk_level=1,
            title="Basic Sentence Structure",
            s3_key="hsk1/01-basic-sentence-structure",
            new_words=None,
        )
        self.mock_prerequisite_cls.query.filter_by.return_value.all.return_value = []
        self.mock_progress_cls.query.filter_by.return_value.first.return_value = None
        exercises = [{"id": f"mcq_{i:03}"} for i in range(1, 21)]
        self.mock_fetch_content.return_value = {
            "explanation": None,
            "exercises": exercises,
        }

        response = self.client.get(
            "/grammar-points/1%7CBasic%20Sentence%20Structure"
        )

        picked = response.get_json()["exercises"]
        self.assertEqual(len(picked), 10)
        for i, exercise in enumerate(picked):
            pair = exercises[2 * i : 2 * i + 2]
            self.assertIn(exercise, pair)

    def test_returns_404_when_grammar_point_does_not_exist(self):
        self.mock_point_cls.query.get.return_value = None

        response = self.client.get("/grammar-points/unknown")

        self.assertEqual(response.status_code, 404)
        self.mock_fetch_content.assert_not_called()


if __name__ == "__main__":
    unittest.main()
