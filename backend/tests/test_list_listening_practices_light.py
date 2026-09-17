import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock, patch

import backend.utils.database.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.app import app  # noqa: E402
from auth_stub import authenticated_client, patch_request_auth  # noqa: E402


class TestListListeningPracticesLightEndpoint(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)

        self.topic_patcher = patch(
            "backend.routes.list_listening_practices_light.ListeningPractice"
        )
        self.mock_topic_cls = self.topic_patcher.start()
        self.addCleanup(self.topic_patcher.stop)

    def test_returns_catalog_fields_ordered_by_hsk_level(self):
        self.mock_topic_cls.query.order_by.return_value.all.return_value = [
            MagicMock(
                id="listening-family-size",
                title="How many are in your family?",
                hsk_level=1,
                type="dialog",
                topic="family",
            ),
            MagicMock(
                id="listening-second-topic",
                title="Second topic",
                hsk_level=2,
                type="fiction_story",
                topic="school",
            ),
        ]

        response = self.client.get("/listening-practices-light")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            {
                "listening_practices": [
                    {
                        "id": "listening-family-size",
                        "title": "How many are in your family?",
                        "hsk_level": 1,
                        "type": "dialog",
                        "topic": "family",
                        "translated_topic": "family",
                    },
                    {
                        "id": "listening-second-topic",
                        "title": "Second topic",
                        "hsk_level": 2,
                        "type": "fiction_story",
                        "topic": "school",
                        "translated_topic": "school",
                    },
                ],
            },
        )

    def test_filters_to_max_hsk_level_when_given(self):
        # A patched-away ListeningPractice.hsk_level is a plain MagicMock,
        # not a real SQLAlchemy column, so it doesn't support `<=` out of
        # the box like the real ORM attribute does.
        self.mock_topic_cls.hsk_level.__le__ = lambda self, other: "hsk_level<=max"
        self.mock_topic_cls.query.filter.return_value.order_by.return_value.all.return_value = [
            MagicMock(
                id="listening-family-size",
                title="How many are in your family?",
                hsk_level=1,
                type="dialog",
                topic="family",
            ),
        ]

        response = self.client.get("/listening-practices-light?max_hsk_level=2")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [practice["id"] for practice in response.get_json()["listening_practices"]],
            ["listening-family-size"],
        )
        self.mock_topic_cls.query.filter.assert_called_once()

    def test_omits_the_filter_when_no_max_hsk_level_is_given(self):
        self.mock_topic_cls.query.order_by.return_value.all.return_value = []

        self.client.get("/listening-practices-light")

        self.mock_topic_cls.query.filter.assert_not_called()

    def test_uses_translated_fields_with_english_fallback(self):
        self.mock_topic_cls.query.order_by.return_value.all.return_value = [
            MagicMock(
                id="listening-family-size",
                title="How many are in your family?",
                hsk_level=1,
                type="dialog",
                topic="family",
            ),
        ]

        with patch(
            "backend.routes.list_listening_practices_light.current_user",
            return_value=MagicMock(language="fr"),
        ), patch(
            "backend.routes.list_listening_practices_light.fetch_listening_practice_translations",
            return_value={
                "listening-family-size": {"title": "Combien de personnes"},
            },
        ) as mock_fetch_translations:
            response = self.client.get("/listening-practices-light")

        mock_fetch_translations.assert_called_once_with("fr")
        practice = response.get_json()["listening_practices"][0]
        self.assertEqual(practice["title"], "Combien de personnes")
        self.assertEqual(practice["type"], "dialog")
        self.assertEqual(practice["translated_topic"], "family")


if __name__ == "__main__":
    unittest.main()
