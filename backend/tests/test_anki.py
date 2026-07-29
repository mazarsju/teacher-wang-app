import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock, patch

import backend.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.app import app  # noqa: E402
from postgres_test_case import PostgresTestCase  # noqa: E402


class TestAnkiRoutes(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        self.status_patcher = patch("backend.routes.anki.anki_sync.get_anki_status")
        self.setup_patcher = patch("backend.routes.anki.anki_sync.setup_deck")
        self.sync_data_patcher = patch("backend.routes.anki.anki_sync.get_sync_data")
        self.mark_patcher = patch(
            "backend.routes.anki.anki_sync.mark_synchronized_result"
        )
        self.push_patcher = patch(
            "backend.routes.anki.anki_sync.apply_push_completion"
        )
        self.pull_patcher = patch("backend.routes.anki.anki_sync.apply_pull")
        self.mock_status = self.status_patcher.start()
        self.mock_setup = self.setup_patcher.start()
        self.mock_sync_data = self.sync_data_patcher.start()
        self.mock_mark = self.mark_patcher.start()
        self.mock_push = self.push_patcher.start()
        self.mock_pull = self.pull_patcher.start()
        self.addCleanup(self.status_patcher.stop)
        self.addCleanup(self.setup_patcher.stop)
        self.addCleanup(self.sync_data_patcher.stop)
        self.addCleanup(self.mark_patcher.stop)
        self.addCleanup(self.push_patcher.stop)
        self.addCleanup(self.pull_patcher.stop)

    def test_get_anki_status_returns_payload(self):
        self.mock_status.return_value = {
            "synchronization_status": "not_synchronized",
            "pending_push_estimate": 0,
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

    def test_setup_anki_deck_saves_mapping(self):
        self.mock_setup.return_value = {
            "status": "synchronized",
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
            },
        )

        self.assertEqual(response.status_code, 200)
        self.mock_setup.assert_called_once_with(
            "mandarin_writting",
            "Characters",
            model_name="Basic",
            fields={"recto": "Front", "verso": "Back"},
        )
        self.assertEqual(
            response.get_json(),
            {
                "kind": "mandarin_writting",
                "deck": self.mock_setup.return_value,
            },
        )

    def test_setup_rejects_invalid_kind(self):
        response = self.client.post(
            "/anki/decks/setup",
            json={
                "kind": "nope",
                "deck_name": "Deck",
                "model_name": "Basic",
                "fields": {"recto": "Front", "verso": "Back"},
            },
        )
        self.assertEqual(response.status_code, 400)

    def test_get_sync_data_returns_payload(self):
        self.mock_sync_data.return_value = {
            "kind": "mandarin_vocabulary",
            "push_cards": [],
            "unsyncable": [],
            "local_words": [],
            "characters": [],
            "ignore_keys": [],
            "deck": {
                "status": "synchronized",
                "deck_name": "Vocab",
                "model_name": "Basic",
                "fields": {
                    "writting": "Front",
                    "pinyin": "Back",
                    "definition": "Extra",
                },
            },
        }

        response = self.client.get("/anki/sync/data/mandarin_vocabulary")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), self.mock_sync_data.return_value)
        self.mock_sync_data.assert_called_once_with("mandarin_vocabulary")

    def test_deleted_anki_connect_proxy_routes_are_gone(self):
        self.assertEqual(self.client.get("/anki/decks").status_code, 404)
        self.assertEqual(self.client.get("/anki/models").status_code, 404)
        self.assertEqual(self.client.post("/anki/sync/quick", json={}).status_code, 404)
        self.assertEqual(self.client.post("/anki/sync", json={}).status_code, 404)

    def test_mark_synchronized_with_ids(self):
        self.mock_mark.return_value = {
            "kind": "mandarin_vocabulary",
            "action": "partial",
            "direction": "push",
            "added": 0,
            "ignored": 1,
            "failed": 0,
            "deck": {"status": "synchronized"},
        }

        response = self.client.post(
            "/anki/sync/mark-synchronized",
            json={
                "kind": "mandarin_vocabulary",
                "action": "partial",
                "ids": ["水"],
            },
        )

        self.assertEqual(response.status_code, 200)
        self.mock_mark.assert_called_once_with(
            "mandarin_vocabulary",
            ["水"],
            action="partial",
            pull_count=None,
        )

    def test_mark_synchronized_push_completion(self):
        self.mock_push.return_value = {
            "kind": "mandarin_vocabulary",
            "action": "synchronize_all",
            "direction": "push",
            "added": 1,
            "ignored": 0,
            "failed": 0,
            "deck": {"status": "synchronized"},
        }

        response = self.client.post(
            "/anki/sync/mark-synchronized",
            json={
                "kind": "mandarin_vocabulary",
                "action": "synchronize_all",
                "succeeded_ids": ["水"],
                "ignore_ids": [],
                "failed": 0,
            },
        )

        self.assertEqual(response.status_code, 200)
        self.mock_push.assert_called_once()

    def test_pull_apply(self):
        self.mock_pull.return_value = {
            "kind": "mandarin_vocabulary",
            "action": "synchronize_all",
            "direction": "pull",
            "added": 1,
            "characters_added": 0,
            "ignored": 0,
            "failed": 0,
            "deck": {"status": "synchronized"},
        }

        response = self.client.post(
            "/anki/sync/pull-apply",
            json={
                "kind": "mandarin_vocabulary",
                "action": "synchronize_all",
                "cards": [
                    {
                        "id": "水",
                        "writting": "水",
                        "pinyin": "shui3",
                        "definition": "water",
                    }
                ],
                "ignore_keys": [],
            },
        )

        self.assertEqual(response.status_code, 200)
        self.mock_pull.assert_called_once()


class TestAnkiSyncHelpers(PostgresTestCase):
    def setUp(self):
        from backend.settings import ensure_default_settings

        super().setUp()
        ensure_default_settings()

    def test_get_anki_status_defaults_to_not_configured(self):
        from backend.anki_sync import get_anki_status

        status = get_anki_status()

        self.assertNotIn("connected", status)
        self.assertEqual(status["synchronization_status"], "not_synchronized")
        self.assertEqual(status["pending_push_estimate"], 0)
        self.assertEqual(
            status["decks"]["mandarin_vocabulary"]["status"], "not_configured"
        )
        self.assertEqual(
            status["decks"]["mandarin_writting"]["status"], "not_configured"
        )

    def test_setup_deck_persists_mapping(self):
        from backend.anki_sync import setup_deck
        from backend.settings import (
            SETTING_ANKI_MANDARIN_WRITTING_DECK,
            SETTING_ANKI_MANDARIN_WRITTING_FIELDS,
            SETTING_ANKI_MANDARIN_WRITTING_MODEL,
            get_setting,
        )

        result = setup_deck(
            "mandarin_writting",
            "Characters",
            model_name="Basic",
            fields={"recto": "Front", "verso": "Back"},
        )

        self.assertEqual(result["status"], "synchronized")
        self.assertEqual(get_setting(SETTING_ANKI_MANDARIN_WRITTING_DECK), "Characters")
        self.assertEqual(get_setting(SETTING_ANKI_MANDARIN_WRITTING_MODEL), "Basic")
        self.assertIn("recto", get_setting(SETTING_ANKI_MANDARIN_WRITTING_FIELDS))

    def test_setup_vocabulary_deck_persists_settings(self):
        from backend.anki_sync import setup_deck
        from backend.settings import (
            SETTING_ANKI_MANDARIN_VOCABULARY_DECK,
            SETTING_ANKI_MANDARIN_VOCABULARY_FIELDS,
            SETTING_ANKI_MANDARIN_VOCABULARY_MODEL,
            get_setting,
        )

        result = setup_deck(
            "mandarin_vocabulary",
            "Vocab",
            model_name="VocabModel",
            fields={
                "writting": "Hanzi",
                "pinyin": "Pinyin",
                "definition": "Meaning",
            },
        )

        self.assertEqual(result["status"], "synchronized")
        self.assertEqual(get_setting(SETTING_ANKI_MANDARIN_VOCABULARY_DECK), "Vocab")
        self.assertEqual(
            get_setting(SETTING_ANKI_MANDARIN_VOCABULARY_MODEL), "VocabModel"
        )
        self.assertIn("writting", get_setting(SETTING_ANKI_MANDARIN_VOCABULARY_FIELDS))

    def test_overall_status_promotes_when_both_decks_synchronized(self):
        from backend.anki_sync import (
            get_overall_anki_synchronization_status,
            maybe_promote_overall_anki_synchronization,
            setup_deck,
        )
        from backend.settings import SETTING_ANKI_SYNCHRONIZATION_STATUS, get_setting

        setup_deck(
            "mandarin_vocabulary",
            "Vocab",
            model_name="Basic",
            fields={
                "writting": "Front",
                "pinyin": "Back",
                "definition": "Extra",
            },
        )
        self.assertEqual(get_overall_anki_synchronization_status(), "not_synchronized")
        setup_deck(
            "mandarin_writting",
            "Writing",
            model_name="Basic",
            fields={"recto": "Front", "verso": "Back"},
        )
        status = maybe_promote_overall_anki_synchronization()

        self.assertEqual(status, "synchronized")
        self.assertEqual(
            get_setting(SETTING_ANKI_SYNCHRONIZATION_STATUS), "synchronized"
        )

    def test_overall_status_stays_synchronized_when_new_pending_cards_exist(self):
        from backend.anki_sync import get_anki_status, setup_deck
        from backend.extensions import db
        from backend.models import Word
        from backend.settings import (
            SETTING_ANKI_SYNCHRONIZATION_STATUS,
            set_setting,
        )

        setup_deck(
            "mandarin_vocabulary",
            "Vocab",
            model_name="Basic",
            fields={
                "writting": "Front",
                "pinyin": "Back",
                "definition": "Extra",
            },
        )
        setup_deck(
            "mandarin_writting",
            "Writing",
            model_name="Basic",
            fields={"recto": "Front", "verso": "Back"},
        )
        set_setting(SETTING_ANKI_SYNCHRONIZATION_STATUS, "synchronized", commit=True)
        db.session.add(Word(word="火", definition="fire", synchronized=False))
        db.session.commit()

        status = get_anki_status()

        self.assertEqual(status["synchronization_status"], "synchronized")
        self.assertEqual(status["pending_push_estimate"], 1)
        self.assertEqual(
            status["decks"]["mandarin_vocabulary"]["status"], "not_synchronized"
        )

    def test_get_sync_data_returns_pending_vocabulary_cards(self):
        from backend.anki_sync import get_sync_data, setup_deck
        from backend.extensions import db
        from backend.models import Character, Word

        setup_deck(
            "mandarin_vocabulary",
            "Vocab",
            model_name="Basic",
            fields={
                "writting": "Front",
                "pinyin": "Back",
                "definition": "Extra",
            },
        )
        db.session.add(Character(char="水", pinyin="shui3", writting_known=False))
        db.session.add(Word(word="水", definition="water", synchronized=False))
        db.session.commit()

        payload = get_sync_data("mandarin_vocabulary")

        self.assertEqual(payload["kind"], "mandarin_vocabulary")
        self.assertEqual(len(payload["push_cards"]), 1)
        self.assertEqual(payload["push_cards"][0]["writting"], "水")
        self.assertEqual(payload["push_cards"][0]["pinyin"], "shui3")
        self.assertIn("水", payload["local_words"])

    def test_mark_synchronized_marks_words(self):
        from backend.anki_sync import apply_push_completion, setup_deck
        from backend.extensions import db
        from backend.models import Word

        setup_deck(
            "mandarin_vocabulary",
            "Vocab",
            model_name="Basic",
            fields={
                "writting": "Front",
                "pinyin": "Back",
                "definition": "Extra",
            },
        )
        db.session.add(Word(word="水", definition="water", synchronized=False))
        db.session.add(Word(word="火", definition="fire", synchronized=False))
        db.session.commit()

        result = apply_push_completion(
            "mandarin_vocabulary",
            "partial",
            succeeded_card_ids=["水"],
            ignore_ids=["火"],
        )

        self.assertEqual(result["added"], 1)
        self.assertEqual(result["ignored"], 1)
        self.assertTrue(Word.query.filter_by(word="水").one().synchronized)
        self.assertTrue(Word.query.filter_by(word="火").one().synchronized)

    def test_cancel_all_marks_words_synchronized(self):
        from backend.anki_sync import apply_push_completion, setup_deck
        from backend.extensions import db
        from backend.models import Word

        setup_deck(
            "mandarin_vocabulary",
            "Vocab",
            model_name="Basic",
            fields={
                "writting": "Front",
                "pinyin": "Back",
                "definition": "Extra",
            },
        )
        db.session.add(Word(word="猫", definition="cat", synchronized=False))
        db.session.commit()

        result = apply_push_completion(
            "mandarin_vocabulary",
            "cancel_all",
            succeeded_card_ids=[],
            ignore_ids=["猫"],
        )

        self.assertEqual(result["ignored"], 1)
        self.assertTrue(Word.query.filter_by(word="猫").one().synchronized)

    def test_pull_import_vocabulary_card(self):
        from backend.anki_sync import apply_pull, setup_deck
        from backend.models import Character, Word

        setup_deck(
            "mandarin_vocabulary",
            "Vocab",
            model_name="Basic",
            fields={
                "writting": "Front",
                "pinyin": "Back",
                "definition": "Extra",
            },
        )

        result = apply_pull(
            "mandarin_vocabulary",
            "synchronize_all",
            cards=[
                {
                    "id": "水",
                    "writting": "水",
                    "pinyin": "shui3",
                    "definition": "water",
                }
            ],
            ignore_keys=[],
        )

        self.assertEqual(result["added"], 1)
        self.assertEqual(result["characters_added"], 1)
        word = Word.query.filter_by(word="水").one()
        self.assertTrue(word.synchronized)
        self.assertEqual(word.definition, "water")
        self.assertTrue(Character.query.filter_by(char="水").one().synchronized)

    def test_pull_ignore_vocabulary_card(self):
        from backend.anki_sync import apply_pull, setup_deck
        from backend.models import IgnoreVocabCard

        setup_deck(
            "mandarin_vocabulary",
            "Vocab",
            model_name="Basic",
            fields={
                "writting": "Front",
                "pinyin": "Back",
                "definition": "Extra",
            },
        )

        result = apply_pull(
            "mandarin_vocabulary",
            "cancel_all",
            cards=[],
            ignore_keys=["稀有"],
        )

        self.assertEqual(result["ignored"], 1)
        self.assertIn("稀有", {row.writting for row in IgnoreVocabCard.query.all()})

    def test_pull_import_writting_card(self):
        from backend.anki_sync import apply_pull, setup_deck
        from backend.extensions import db
        from backend.models import Character

        setup_deck(
            "mandarin_writting",
            "Writing",
            model_name="Basic",
            fields={"recto": "Front", "verso": "Back"},
        )
        db.session.add(
            Character(char="水", pinyin="shui3", writting_known=False, synchronized=False)
        )
        db.session.commit()

        result = apply_pull(
            "mandarin_writting",
            "synchronize_all",
            cards=[{"id": "水", "recto": "shui3", "verso": "水"}],
            ignore_keys=[],
        )

        self.assertEqual(result["added"], 1)
        updated = Character.query.filter_by(char="水").one()
        self.assertTrue(updated.writting_known)
        self.assertTrue(updated.synchronized)

    def test_pull_ignore_writting_card(self):
        from backend.anki_sync import apply_pull, setup_deck
        from backend.models import IgnoreWrittingCard

        setup_deck(
            "mandarin_writting",
            "Writing",
            model_name="Basic",
            fields={"recto": "Front", "verso": "Back"},
        )

        result = apply_pull(
            "mandarin_writting",
            "cancel_all",
            cards=[],
            ignore_keys=["water (shui3)"],
        )

        self.assertEqual(result["ignored"], 1)
        self.assertIn(
            "water (shui3)",
            {row.recto for row in IgnoreWrittingCard.query.all()},
        )

    def test_get_sync_data_writting_unsyncable(self):
        from backend.anki_sync import get_sync_data, setup_deck
        from backend.extensions import db
        from backend.models import Character

        setup_deck(
            "mandarin_writting",
            "Writing",
            model_name="Basic",
            fields={"recto": "Front", "verso": "Back"},
        )
        db.session.add(
            Character(char="孤", pinyin="gu1", writting_known=True, synchronized=False)
        )
        db.session.commit()

        payload = get_sync_data("mandarin_writting")

        self.assertEqual(payload["unsyncable"], ["孤"])
        self.assertEqual(payload["push_cards"], [])

    def test_vocabulary_card_pinyin_keeps_punctuation(self):
        from backend.anki_sync import vocabulary_card_from_word
        from backend.extensions import db
        from backend.models import Character, Word

        db.session.add(Character(char="除", pinyin="chu2", writting_known=False))
        db.session.add(Character(char="了", pinyin="le", writting_known=False))
        db.session.add(Character(char="以", pinyin="yi3", writting_known=False))
        db.session.add(Character(char="外", pinyin="wai4", writting_known=False))
        word = Word(word="除了。。以外。。", definition="except", synchronized=False)
        db.session.add(word)
        db.session.commit()

        card = vocabulary_card_from_word(word)
        self.assertEqual(card["pinyin"], "chu2 le。。yi3 wai4。。")


if __name__ == "__main__":
    unittest.main()
