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

    def test_get_pending_sync_returns_payload(self):
        with patch(
            "backend.routes.anki.anki_sync.get_pending_sync",
            return_value={
                "kind": "mandarin_vocabulary",
                "count": 1,
                "cards": [
                    {
                        "id": "水",
                        "writting": "水",
                        "pinyin": "shui3",
                        "definition": "water",
                    }
                ],
                "unsyncable": [],
                "pull_count": 0,
                "deck": {
                    "status": "not_synchronized",
                    "deck_name": "Vocab",
                    "model_name": "Vocab",
                    "fields": {
                        "writting": "writting",
                        "pinyin": "pinyin",
                        "definition": "definition",
                    },
                },
            },
        ) as mock_pending:
            response = self.client.get("/anki/sync/pending/mandarin_vocabulary")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["count"], 1)
        mock_pending.assert_called_once_with("mandarin_vocabulary")

    def test_sync_anki_deck_runs_action(self):
        with patch(
            "backend.routes.anki.anki_sync.run_sync",
            return_value={
                "kind": "mandarin_vocabulary",
                "action": "synchronize_all",
                "added": 2,
                "ignored": 0,
                "failed": 0,
                "deck": {
                    "status": "synchronized",
                    "deck_name": "Vocab",
                    "model_name": "Vocab",
                    "fields": {
                        "writting": "writting",
                        "pinyin": "pinyin",
                        "definition": "definition",
                    },
                },
            },
        ) as mock_run:
            response = self.client.post(
                "/anki/sync",
                json={
                    "kind": "mandarin_vocabulary",
                    "action": "synchronize_all",
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["added"], 2)
        mock_run.assert_called_once_with(
            "mandarin_vocabulary",
            "synchronize_all",
            selected_ids=None,
        )


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
        # No pending writting_known characters → configured deck is synchronized.
        self.assertEqual(
            result,
            {
                "status": "synchronized",
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

        # No unsynced words yet → configured deck is considered synchronized.
        self.assertEqual(result["status"], "synchronized")
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

    def test_deck_status_not_synchronized_when_pull_pending(self):
        from backend.anki_sync import get_deck_mapping
        from backend.extensions import db

        self._configure_vocabulary_deck()
        db.session.commit()

        with patch(
            "backend.anki_sync.anki_connect.mapped_notes_in_deck",
            return_value=[
                {"writting": "火", "pinyin": "huo3", "definition": "fire"},
            ],
        ):
            mapping = get_deck_mapping("mandarin_vocabulary")

        self.assertEqual(mapping["status"], "not_synchronized")

    def test_deck_status_synchronized_only_when_push_and_pull_empty(self):
        from backend.anki_sync import get_deck_mapping
        from backend.extensions import db

        self._configure_vocabulary_deck()
        db.session.commit()

        with patch(
            "backend.anki_sync.anki_connect.mapped_notes_in_deck",
            return_value=[],
        ):
            mapping = get_deck_mapping("mandarin_vocabulary")

        self.assertEqual(mapping["status"], "synchronized")

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

    def _configure_vocabulary_deck(self):
        from backend.settings import (
            SETTING_ANKI_MANDARIN_VOCABULARY_DECK,
            SETTING_ANKI_MANDARIN_VOCABULARY_FIELDS,
            SETTING_ANKI_MANDARIN_VOCABULARY_MODEL,
            set_setting,
        )

        set_setting(SETTING_ANKI_MANDARIN_VOCABULARY_DECK, "Vocab", commit=False)
        set_setting(SETTING_ANKI_MANDARIN_VOCABULARY_MODEL, "VocabModel", commit=False)
        set_setting(
            SETTING_ANKI_MANDARIN_VOCABULARY_FIELDS,
            '{"writting": "writting", "pinyin": "pinyin", "definition": "definition"}',
            commit=True,
        )

    def test_pending_vocabulary_cards_include_joined_pinyin(self):
        from backend.anki_sync import get_pending_sync
        from backend.extensions import db
        from backend.models import Character, Word

        self._configure_vocabulary_deck()
        db.session.add(Character(char="你", pinyin="ni3", writting_known=False))
        db.session.add(Character(char="好", pinyin="hao3", writting_known=True))
        db.session.add(Word(word="你好", definition="hello"))
        db.session.add(Word(word="猫", definition="cat", synchronized=True))
        db.session.commit()

        with patch(
            "backend.anki_sync.anki_connect.mapped_notes_in_deck",
            return_value=[],
        ):
            pending = get_pending_sync("mandarin_vocabulary")

        self.assertEqual(pending["count"], 1)
        self.assertEqual(pending["pull_count"], 0)
        self.assertEqual(pending["pull_cards"], [])
        self.assertEqual(
            pending["cards"],
            [
                {
                    "id": "你好",
                    "writting": "你好",
                    "pinyin": "ni3 hao3",
                    "definition": "hello",
                }
            ],
        )
        self.assertEqual(pending["deck"]["status"], "not_synchronized")

    def test_pending_vocabulary_pull_count_excludes_local_words(self):
        from backend.anki_sync import get_pending_sync
        from backend.extensions import db
        from backend.models import Character, Word

        self._configure_vocabulary_deck()
        db.session.add(Character(char="水", pinyin="shui3", writting_known=False))
        db.session.add(Word(word="水", definition="water", synchronized=True))
        db.session.commit()

        with patch(
            "backend.anki_sync.anki_connect.mapped_notes_in_deck",
            return_value=[
                {"writting": "水", "pinyin": "shui3", "definition": "water"},
                {"writting": "火", "pinyin": "huo3", "definition": "fire"},
                {"writting": "风", "pinyin": "feng1", "definition": "wind"},
            ],
        ):
            pending = get_pending_sync("mandarin_vocabulary")

        self.assertEqual(pending["pull_count"], 2)
        self.assertEqual(
            [card["id"] for card in pending["pull_cards"]],
            ["火", "风"],
        )
        self.assertEqual(pending["pull_characters_to_create_count"], 2)
        self.assertEqual(
            pending["pull_cards"][0]["characters_to_create"],
            ["火"],
        )
        self.assertEqual(pending["count"], 0)

    def test_vocabulary_pinyin_keeps_unrecognized_characters(self):
        from backend.anki_sync import _vocabulary_card_pinyin
        from backend.extensions import db
        from backend.models import Character

        db.session.add(Character(char="除", pinyin="chu2", writting_known=False))
        db.session.add(Character(char="了", pinyin="le", writting_known=False))
        db.session.add(Character(char="以", pinyin="yi3", writting_known=False))
        db.session.add(Character(char="外", pinyin="wai4", writting_known=False))
        db.session.commit()

        self.assertEqual(
            _vocabulary_card_pinyin("除了。。以外。。"),
            "chu2 le。。yi3 wai4。。",
        )

    def test_pending_vocabulary_excludes_writtings_already_in_anki(self):
        from backend.anki_sync import get_pending_sync
        from backend.extensions import db
        from backend.models import Character, Word

        self._configure_vocabulary_deck()
        db.session.add(Character(char="你", pinyin="ni3", writting_known=False))
        db.session.add(Character(char="好", pinyin="hao3", writting_known=True))
        db.session.add(Character(char="水", pinyin="shui3", writting_known=False))
        db.session.add(Word(word="你好", definition="hello"))
        db.session.add(Word(word="水", definition="water"))
        db.session.commit()

        with patch(
            "backend.anki_sync.anki_connect.mapped_notes_in_deck",
            return_value=[
                {"writting": "你好", "pinyin": "ni3 hao3", "definition": "hello"},
            ],
        ) as mock_notes:
            pending = get_pending_sync("mandarin_vocabulary")

        mock_notes.assert_called_once()
        self.assertEqual(pending["count"], 1)
        self.assertEqual(pending["cards"][0]["id"], "水")
        self.assertTrue(Word.query.filter_by(word="你好").one().synchronized)
        self.assertFalse(Word.query.filter_by(word="水").one().synchronized)

    def test_cancel_all_marks_words_synchronized_without_anki(self):
        from backend.anki_sync import run_sync
        from backend.extensions import db
        from backend.models import Character, Word

        self._configure_vocabulary_deck()
        db.session.add(Character(char="猫", pinyin="mao1", writting_known=False))
        db.session.add(Word(word="猫", definition="cat"))
        db.session.commit()

        with (
            patch(
                "backend.anki_sync.anki_connect.mapped_notes_in_deck",
                return_value=[],
            ),
            patch("backend.anki_sync.anki_connect.add_notes") as mock_add,
        ):
            result = run_sync("mandarin_vocabulary", "cancel_all")

        mock_add.assert_not_called()
        self.assertEqual(result["added"], 0)
        self.assertEqual(result["ignored"], 1)
        self.assertTrue(Word.query.filter_by(word="猫").one().synchronized)
        self.assertEqual(result["deck"]["status"], "synchronized")

    def test_synchronize_all_adds_notes_and_marks_synchronized(self):
        from backend.anki_sync import run_sync
        from backend.extensions import db
        from backend.models import Character, Word

        self._configure_vocabulary_deck()
        db.session.add(Character(char="水", pinyin="shui3", writting_known=False))
        db.session.add(Word(word="水", definition="water"))
        db.session.commit()

        with (
            patch(
                "backend.anki_sync.anki_connect.mapped_notes_in_deck",
                return_value=[],
            ),
            patch(
                "backend.anki_sync.anki_connect.add_notes",
                return_value=[12345],
            ) as mock_add,
        ):
            result = run_sync("mandarin_vocabulary", "synchronize_all")

        mock_add.assert_called_once()
        note = mock_add.call_args.args[0][0]
        self.assertEqual(note["deckName"], "Vocab")
        self.assertEqual(note["modelName"], "VocabModel")
        self.assertEqual(
            note["fields"],
            {"writting": "水", "pinyin": "shui3", "definition": "water"},
        )
        self.assertEqual(result["added"], 1)
        self.assertEqual(result["ignored"], 0)
        self.assertTrue(Word.query.filter_by(word="水").one().synchronized)

    def test_partial_sync_adds_selected_and_ignores_rest(self):
        from backend.anki_sync import run_sync
        from backend.extensions import db
        from backend.models import Character, Word

        self._configure_vocabulary_deck()
        db.session.add(Character(char="一", pinyin="yi1", writting_known=False))
        db.session.add(Character(char="二", pinyin="er4", writting_known=False))
        db.session.add(Word(word="一", definition="one"))
        db.session.add(Word(word="二", definition="two"))
        db.session.commit()

        with (
            patch(
                "backend.anki_sync.anki_connect.mapped_notes_in_deck",
                return_value=[],
            ),
            patch(
                "backend.anki_sync.anki_connect.add_notes",
                return_value=[99],
            ) as mock_add,
        ):
            result = run_sync(
                "mandarin_vocabulary",
                "partial",
                selected_ids=["一"],
            )

        mock_add.assert_called_once()
        self.assertEqual(result["added"], 1)
        self.assertEqual(result["ignored"], 1)
        self.assertTrue(Word.query.filter_by(word="一").one().synchronized)
        self.assertTrue(Word.query.filter_by(word="二").one().synchronized)

    def test_vocabulary_pull_all_imports_words_and_characters(self):
        from backend.anki_sync import run_pull
        from backend.extensions import db
        from backend.models import Character, Word

        self._configure_vocabulary_deck()
        db.session.commit()

        with patch(
            "backend.anki_sync.anki_connect.mapped_notes_in_deck",
            return_value=[
                {"writting": "你好", "pinyin": "ni3 hao3", "definition": "hello"},
            ],
        ):
            result = run_pull("mandarin_vocabulary", "synchronize_all")

        self.assertEqual(result["added"], 1)
        self.assertEqual(result["characters_added"], 2)
        self.assertEqual(result["ignored"], 0)
        word = Word.query.filter_by(word="你好").one()
        self.assertEqual(word.definition, "hello")
        self.assertTrue(word.synchronized)
        ni = Character.query.filter_by(char="你").one()
        hao = Character.query.filter_by(char="好").one()
        self.assertEqual(ni.pinyin, "ni3")
        self.assertFalse(ni.writting_known)
        self.assertEqual(hao.pinyin, "hao3")
        self.assertFalse(hao.writting_known)

    def test_vocabulary_pull_normalizes_accented_pinyin_and_counts_characters(
        self,
    ):
        from backend.anki_sync import get_pending_sync, run_pull
        from backend.extensions import db
        from backend.models import Character, Word

        self._configure_vocabulary_deck()
        db.session.commit()

        notes = [
            {
                "writting": "亲",
                "pinyin": "Qīn",
                "definition": "close",
            },
            {
                "writting": "一把刀",
                "pinyin": "Yi ba3 dao1",
                "definition": "a knife",
            },
        ]
        with patch(
            "backend.anki_sync.anki_connect.mapped_notes_in_deck",
            return_value=notes,
        ):
            pending = get_pending_sync("mandarin_vocabulary")
            result = run_pull("mandarin_vocabulary", "synchronize_all")

        self.assertEqual(pending["pull_count"], 2)
        self.assertEqual(pending["pull_characters_to_create_count"], 4)
        self.assertEqual(result["added"], 2)
        self.assertEqual(result["characters_added"], 4)
        self.assertEqual(Character.query.filter_by(char="亲").one().pinyin, "qin1")
        self.assertEqual(Character.query.filter_by(char="一").one().pinyin, "yi")
        self.assertEqual(Character.query.filter_by(char="把").one().pinyin, "ba3")
        self.assertEqual(Character.query.filter_by(char="刀").one().pinyin, "dao1")
        self.assertIsNotNone(Word.query.filter_by(word="亲").first())
        self.assertIsNotNone(Word.query.filter_by(word="一把刀").first())

    def test_vocabulary_pull_ignore_all_persists_ignored_keys(self):
        from backend.anki_sync import get_pending_sync, run_pull
        from backend.settings import (
            SETTING_ANKI_MANDARIN_VOCABULARY_PULL_IGNORED,
            get_setting,
        )

        self._configure_vocabulary_deck()

        notes = [
            {"writting": "火", "pinyin": "huo3", "definition": "fire"},
            {"writting": "风", "pinyin": "feng1", "definition": "wind"},
        ]
        with patch(
            "backend.anki_sync.anki_connect.mapped_notes_in_deck",
            return_value=notes,
        ):
            result = run_pull("mandarin_vocabulary", "cancel_all")
            pending = get_pending_sync("mandarin_vocabulary")

        self.assertEqual(result["added"], 0)
        self.assertEqual(result["ignored"], 2)
        self.assertEqual(pending["pull_count"], 0)
        self.assertIn("火", get_setting(SETTING_ANKI_MANDARIN_VOCABULARY_PULL_IGNORED))

    def test_vocabulary_pull_partial_imports_selected_and_ignores_rest(self):
        from backend.anki_sync import run_pull
        from backend.extensions import db
        from backend.models import Word

        self._configure_vocabulary_deck()

        with patch(
            "backend.anki_sync.anki_connect.mapped_notes_in_deck",
            return_value=[
                {"writting": "火", "pinyin": "huo3", "definition": "fire"},
                {"writting": "风", "pinyin": "feng1", "definition": "wind"},
            ],
        ):
            result = run_pull(
                "mandarin_vocabulary",
                "partial",
                selected_ids=["火"],
            )

        self.assertEqual(result["added"], 1)
        self.assertEqual(result["ignored"], 1)
        self.assertIsNotNone(Word.query.filter_by(word="火").first())
        self.assertIsNone(Word.query.filter_by(word="风").first())

    def _configure_writting_deck(self):
        from backend.settings import (
            SETTING_ANKI_MANDARIN_WRITTING_DECK,
            SETTING_ANKI_MANDARIN_WRITTING_FIELDS,
            SETTING_ANKI_MANDARIN_WRITTING_MODEL,
            set_setting,
        )

        set_setting(SETTING_ANKI_MANDARIN_WRITTING_DECK, "Writting", commit=False)
        set_setting(SETTING_ANKI_MANDARIN_WRITTING_MODEL, "Basic", commit=False)
        set_setting(
            SETTING_ANKI_MANDARIN_WRITTING_FIELDS,
            '{"recto": "Front", "verso": "Back"}',
            commit=True,
        )

    def test_pending_writting_builds_recto_verso_and_lists_unsyncable(self):
        from backend.anki_sync import get_pending_sync
        from backend.extensions import db
        from backend.models import Character, Word

        self._configure_writting_deck()
        water = Character(char="水", pinyin="shui3", writting_known=True)
        fire = Character(char="火", pinyin="huo3", writting_known=True)
        lonely = Character(char="孤", pinyin="gu1", writting_known=True)
        db.session.add_all([water, fire, lonely])
        water_word = Word(word="水", definition="water")
        fire_word = Word(word="火", definition="")  # blank → unsyncable via this word
        db.session.add_all([water_word, fire_word])
        water.words.append(water_word)
        fire.words.append(fire_word)
        # lonely has no linked word
        db.session.commit()

        with patch(
            "backend.anki_sync.anki_connect.field_values_in_deck",
            return_value=set(),
        ):
            pending = get_pending_sync("mandarin_writting")

        self.assertEqual(pending["count"], 1)
        self.assertEqual(pending["pull_count"], 0)
        self.assertEqual(
            pending["cards"],
            [
                {
                    "id": "water (shui3)",
                    "recto": "water (shui3)",
                    "verso": "水",
                }
            ],
        )
        self.assertEqual(sorted(pending["unsyncable"]), ["孤", "火"])

    def test_pending_writting_dedupes_by_recto(self):
        from backend.anki_sync import get_pending_sync
        from backend.extensions import db
        from backend.models import Character, Word

        self._configure_writting_deck()
        feng = Character(char="风", pinyin="feng1", writting_known=True)
        xian = Character(char="险", pinyin="xian1", writting_known=True)
        db.session.add_all([feng, xian])
        risk = Word(word="风险", definition="Le risque")
        db.session.add(risk)
        feng.words.append(risk)
        xian.words.append(risk)
        db.session.commit()

        with patch(
            "backend.anki_sync.anki_connect.field_values_in_deck",
            return_value=set(),
        ):
            pending = get_pending_sync("mandarin_writting")

        self.assertEqual(pending["count"], 1)
        self.assertEqual(
            pending["cards"],
            [
                {
                    "id": "Le risque (feng1 xian1)",
                    "recto": "Le risque (feng1 xian1)",
                    "verso": "风险",
                }
            ],
        )
    def test_writting_cancel_all_marks_syncable_and_unsyncable(self):
        from backend.anki_sync import run_sync
        from backend.extensions import db
        from backend.models import Character, Word

        self._configure_writting_deck()
        water = Character(char="水", pinyin="shui3", writting_known=True)
        lonely = Character(char="孤", pinyin="gu1", writting_known=True)
        db.session.add_all([water, lonely])
        water_word = Word(word="水", definition="water")
        db.session.add(water_word)
        water.words.append(water_word)
        db.session.commit()

        with (
            patch(
                "backend.anki_sync.anki_connect.field_values_in_deck",
                return_value=set(),
            ),
            patch("backend.anki_sync.anki_connect.add_notes") as mock_add,
        ):
            result = run_sync("mandarin_writting", "cancel_all")

        mock_add.assert_not_called()
        self.assertEqual(result["added"], 0)
        self.assertEqual(result["ignored"], 2)
        self.assertTrue(Character.query.filter_by(char="水").one().synchronized)
        self.assertTrue(Character.query.filter_by(char="孤").one().synchronized)
        self.assertEqual(result["deck"]["status"], "synchronized")

    def test_writting_partial_does_not_touch_unsyncable(self):
        from backend.anki_sync import run_sync
        from backend.extensions import db
        from backend.models import Character, Word

        self._configure_writting_deck()
        water = Character(char="水", pinyin="shui3", writting_known=True)
        fire = Character(char="火", pinyin="huo3", writting_known=True)
        lonely = Character(char="孤", pinyin="gu1", writting_known=True)
        db.session.add_all([water, fire, lonely])
        water_word = Word(word="水", definition="water")
        fire_word = Word(word="火", definition="fire")
        db.session.add_all([water_word, fire_word])
        water.words.append(water_word)
        fire.words.append(fire_word)
        db.session.commit()

        with (
            patch(
                "backend.anki_sync.anki_connect.field_values_in_deck",
                return_value=set(),
            ),
            patch(
                "backend.anki_sync.anki_connect.add_notes",
                return_value=[11],
            ),
        ):
            result = run_sync(
                "mandarin_writting",
                "partial",
                selected_ids=["water (shui3)"],
            )

        self.assertEqual(result["added"], 1)
        self.assertEqual(result["ignored"], 1)
        self.assertTrue(Character.query.filter_by(char="水").one().synchronized)
        self.assertTrue(Character.query.filter_by(char="火").one().synchronized)
        self.assertFalse(Character.query.filter_by(char="孤").one().synchronized)

    def test_writting_synchronize_all_adds_recto_verso_notes(self):
        from backend.anki_sync import run_sync
        from backend.extensions import db
        from backend.models import Character, Word

        self._configure_writting_deck()
        ni = Character(char="你", pinyin="ni3", writting_known=True)
        hao = Character(char="好", pinyin="hao3", writting_known=True)
        db.session.add_all([ni, hao])
        hello = Word(word="你好", definition="hello")
        db.session.add(hello)
        ni.words.append(hello)
        hao.words.append(hello)
        db.session.commit()

        with (
            patch(
                "backend.anki_sync.anki_connect.field_values_in_deck",
                return_value=set(),
            ),
            patch(
                "backend.anki_sync.anki_connect.add_notes",
                return_value=[1],
            ) as mock_add,
        ):
            result = run_sync("mandarin_writting", "synchronize_all")

        mock_add.assert_called_once()
        notes = mock_add.call_args.kwargs.get("notes") or mock_add.call_args.args[0]
        self.assertEqual(len(notes), 1)
        self.assertEqual(
            notes[0]["fields"],
            {"Front": "hello (ni3 hao3)", "Back": "你好"},
        )
        # One Anki note, but every character in the verso is marked synchronized.
        self.assertEqual(result["added"], 2)
        self.assertTrue(Character.query.filter_by(char="你").one().synchronized)
        self.assertTrue(Character.query.filter_by(char="好").one().synchronized)


if __name__ == "__main__":
    unittest.main()
