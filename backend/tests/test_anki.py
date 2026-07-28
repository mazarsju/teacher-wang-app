import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock, patch

import backend.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.anki_connect import AnkiConnectError  # noqa: E402
from backend.app import app  # noqa: E402


class TestAnkiRoutes(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        self.status_patcher = patch("backend.routes.anki.anki_sync.get_anki_status")
        self.deck_names_patcher = patch("backend.routes.anki.anki_connect.deck_names")
        self.model_names_patcher = patch("backend.routes.anki.anki_connect.model_names")
        self.model_fields_patcher = patch(
            "backend.routes.anki.anki_connect.model_field_names"
        )
        self.setup_patcher = patch("backend.routes.anki.anki_sync.setup_deck")
        self.mock_status = self.status_patcher.start()
        self.mock_deck_names = self.deck_names_patcher.start()
        self.mock_model_names = self.model_names_patcher.start()
        self.mock_model_fields = self.model_fields_patcher.start()
        self.mock_setup = self.setup_patcher.start()
        self.addCleanup(self.status_patcher.stop)
        self.addCleanup(self.deck_names_patcher.stop)
        self.addCleanup(self.model_names_patcher.stop)
        self.addCleanup(self.model_fields_patcher.stop)
        self.addCleanup(self.setup_patcher.stop)
        self.mock_status.reset_mock()
        self.mock_deck_names.reset_mock()
        self.mock_model_names.reset_mock()
        self.mock_model_fields.reset_mock()
        self.mock_setup.reset_mock()

    def test_get_anki_status_returns_payload(self):
        self.mock_status.return_value = {
            "connected": False,
            "decks": {
                "mandarin_vocabulary": {
                    "status": "not_configured",
                    "deck_name": "",
                    "model_name": "",
                    "fields": {},
                },
                "mandarin_writting": {
                    "status": "not_configured",
                    "deck_name": "",
                    "model_name": "",
                    "fields": {},
                },
            },
        }

        response = self.client.get("/anki/status")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), self.mock_status.return_value)
        self.mock_status.assert_called_once()

    def test_list_anki_decks_returns_names(self):
        self.mock_deck_names.return_value = ["Default", "Mandarin::Characters"]

        response = self.client.get("/anki/decks")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            {"decks": ["Default", "Mandarin::Characters"]},
        )

    def test_list_anki_models_and_fields(self):
        self.mock_model_names.return_value = ["Basic", "Words"]
        self.mock_model_fields.return_value = ["Front", "Back"]

        models_response = self.client.get("/anki/models")
        fields_response = self.client.get("/anki/models/Basic/fields")

        self.assertEqual(models_response.status_code, 200)
        self.assertEqual(models_response.get_json(), {"models": ["Basic", "Words"]})
        self.assertEqual(fields_response.status_code, 200)
        self.assertEqual(fields_response.get_json(), {"fields": ["Front", "Back"]})

    def test_list_anki_decks_returns_503_when_unreachable(self):
        self.mock_deck_names.side_effect = AnkiConnectError("unreachable")

        response = self.client.get("/anki/decks")

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.get_json(), {"error": "unreachable"})

    def test_setup_anki_deck_saves_mapping(self):
        self.mock_setup.return_value = {
            "status": "not_synchronized",
            "deck_name": "Characters",
            "model_name": "Basic",
            "fields": {"recto": "Front", "verso": "Back"},
        }

        response = self.client.post(
            "/anki/decks/setup",
            json={
                "kind": "mandarin_writting",
                "deck_name": "Characters",
                "model_name": "Basic",
                "fields": {"recto": "Front", "verso": "Back"},
                "create": True,
            },
        )

        self.assertEqual(response.status_code, 200)
        self.mock_setup.assert_called_once_with(
            "mandarin_writting",
            "Characters",
            model_name="Basic",
            fields={"recto": "Front", "verso": "Back"},
            create=True,
        )
        self.assertEqual(
            response.get_json(),
            {
                "kind": "mandarin_writting",
                "deck": {
                    "status": "not_synchronized",
                    "deck_name": "Characters",
                    "model_name": "Basic",
                    "fields": {"recto": "Front", "verso": "Back"},
                },
            },
        )

    def test_setup_anki_deck_rejects_invalid_kind(self):
        response = self.client.post(
            "/anki/decks/setup",
            json={
                "kind": "invalid",
                "deck_name": "Characters",
                "model_name": "Basic",
                "fields": {"recto": "Front", "verso": "Back"},
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("kind", response.get_json()["error"])
        self.mock_setup.assert_not_called()

    def test_setup_anki_deck_returns_400_on_value_error(self):
        self.mock_setup.side_effect = ValueError('Deck "Missing" was not found in Anki.')

        response = self.client.post(
            "/anki/decks/setup",
            json={
                "kind": "mandarin_vocabulary",
                "deck_name": "Missing",
                "model_name": "Words",
                "fields": {
                    "writting": "Hanzi",
                    "pinyin": "Reading",
                    "definition": "Meaning",
                },
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("Missing", response.get_json()["error"])

    def test_auto_setup_vocabulary_creates_model_and_mapping(self):
        auto_patcher = patch(
            "backend.routes.anki.anki_sync.create_vocabulary_three_direction_setup"
        )
        mock_auto = auto_patcher.start()
        self.addCleanup(auto_patcher.stop)
        mock_auto.return_value = {
            "status": "not_configured",
            "deck_name": "Mandarin vocabulary",
            "model_name": "Mandarin vocabulary",
            "fields": {
                "writting": "writting",
                "pinyin": "pinyin",
                "definition": "definition",
            },
        }

        response = self.client.post(
            "/anki/vocabulary/auto-setup",
            json={
                "deck_name": "Mandarin vocabulary",
                "model_name": "Mandarin vocabulary",
                "optional_fields": ["example"],
            },
        )

        self.assertEqual(response.status_code, 200)
        mock_auto.assert_called_once_with(
            deck_name="Mandarin vocabulary",
            model_name="Mandarin vocabulary",
            optional_fields=["example"],
        )
        self.assertEqual(response.get_json()["kind"], "mandarin_vocabulary")


class TestAnkiSyncHelpers(unittest.TestCase):
    def setUp(self):
        from flask import Flask

        from backend.extensions import db
        from backend.settings import ensure_default_settings

        self.app = Flask(__name__)
        self.app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"
        self.app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
        db.init_app(self.app)
        self.app_context = self.app.app_context()
        self.app_context.push()
        db.create_all()
        ensure_default_settings()

    def tearDown(self):
        from backend.extensions import db

        db.session.remove()
        db.drop_all()
        self.app_context.pop()

    def test_get_anki_status_defaults_to_not_configured(self):
        from backend.anki_sync import get_anki_status

        with patch("backend.anki_sync.anki_connect.is_connected", return_value=False):
            status = get_anki_status()

        self.assertFalse(status["connected"])
        self.assertEqual(
            status["decks"]["mandarin_vocabulary"]["status"], "not_configured"
        )
        self.assertEqual(
            status["decks"]["mandarin_writting"]["status"], "not_configured"
        )

    def test_setup_deck_persists_not_synchronized_status(self):
        from backend.anki_sync import setup_deck
        from backend.settings import (
            SETTING_ANKI_MANDARIN_WRITTING_DECK,
            SETTING_ANKI_MANDARIN_WRITTING_FIELDS,
            SETTING_ANKI_MANDARIN_WRITTING_MODEL,
            get_setting,
        )

        with (
            patch("backend.anki_sync.anki_connect.create_deck") as mock_create,
            patch(
                "backend.anki_sync.anki_connect.deck_names",
                return_value=["Characters"],
            ),
            patch(
                "backend.anki_sync.anki_connect.model_names",
                return_value=["Basic"],
            ),
            patch(
                "backend.anki_sync.anki_connect.model_field_names",
                return_value=["Front", "Back"],
            ),
        ):
            result = setup_deck(
                "mandarin_writting",
                "Characters",
                model_name="Basic",
                fields={"recto": "Front", "verso": "Back"},
                create=True,
            )

        mock_create.assert_called_once_with("Characters")
        self.assertEqual(
            result,
            {
                "status": "not_synchronized",
                "deck_name": "Characters",
                "model_name": "Basic",
                "fields": {"recto": "Front", "verso": "Back"},
            },
        )
        self.assertEqual(
            get_setting(SETTING_ANKI_MANDARIN_WRITTING_DECK), "Characters"
        )
        self.assertEqual(
            get_setting(SETTING_ANKI_MANDARIN_WRITTING_MODEL), "Basic"
        )
        self.assertEqual(
            get_setting(SETTING_ANKI_MANDARIN_WRITTING_FIELDS),
            '{"recto": "Front", "verso": "Back"}',
        )

    def test_setup_vocabulary_deck_persists_settings(self):
        from backend.anki_sync import setup_deck
        from backend.settings import (
            SETTING_ANKI_MANDARIN_VOCABULARY_DECK,
            SETTING_ANKI_MANDARIN_VOCABULARY_FIELDS,
            SETTING_ANKI_MANDARIN_VOCABULARY_MODEL,
            get_setting,
        )

        with (
            patch(
                "backend.anki_sync.anki_connect.deck_names",
                return_value=["Mandarin vocabulary"],
            ),
            patch(
                "backend.anki_sync.anki_connect.model_names",
                return_value=["Mandarin vocabulary"],
            ),
            patch(
                "backend.anki_sync.anki_connect.model_field_names",
                return_value=["writting", "pinyin", "definition"],
            ),
        ):
            result = setup_deck(
                "mandarin_vocabulary",
                "Mandarin vocabulary",
                model_name="Mandarin vocabulary",
                fields={
                    "writting": "writting",
                    "pinyin": "pinyin",
                    "definition": "definition",
                },
                create=False,
            )

        self.assertEqual(result["status"], "not_synchronized")
        self.assertEqual(
            get_setting(SETTING_ANKI_MANDARIN_VOCABULARY_DECK),
            "Mandarin vocabulary",
        )
        self.assertEqual(
            get_setting(SETTING_ANKI_MANDARIN_VOCABULARY_MODEL),
            "Mandarin vocabulary",
        )
        self.assertEqual(
            get_setting(SETTING_ANKI_MANDARIN_VOCABULARY_FIELDS),
            '{"writting": "writting", "pinyin": "pinyin", "definition": "definition"}',
        )

    def test_create_vocabulary_three_direction_setup(self):
        from backend.anki_sync import create_vocabulary_three_direction_setup

        with (
            patch(
                "backend.anki_sync.anki_connect.model_names",
                side_effect=[["Basic"], ["Basic", "Mandarin vocabulary"]],
            ),
            patch("backend.anki_sync.anki_connect.create_model") as mock_create_model,
            patch("backend.anki_sync.anki_connect.create_deck") as mock_create_deck,
        ):
            result = create_vocabulary_three_direction_setup(
                deck_name="Mandarin vocabulary",
                model_name="Mandarin vocabulary",
                optional_fields=["example"],
            )

        mock_create_model.assert_called_once()
        create_kwargs = mock_create_model.call_args.kwargs
        self.assertEqual(create_kwargs["model_name"], "Mandarin vocabulary")
        self.assertEqual(
            create_kwargs["fields"],
            ["writting", "pinyin", "definition", "example"],
        )
        self.assertEqual(len(create_kwargs["card_templates"]), 3)
        mock_create_deck.assert_called_once_with("Mandarin vocabulary")
        self.assertEqual(result["status"], "not_configured")
        self.assertEqual(result["deck_name"], "Mandarin vocabulary")
        self.assertEqual(result["model_name"], "Mandarin vocabulary")
        self.assertEqual(
            result["fields"],
            {
                "writting": "writting",
                "pinyin": "pinyin",
                "definition": "definition",
            },
        )


if __name__ == "__main__":
    unittest.main()
