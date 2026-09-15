import bootstrap  # noqa: F401
from unittest.mock import patch

from backend.utils.database.extensions import db
from backend.utils.database.models import (
    Character,
    GrammarPoint,
    ListeningPractice,
    ListeningProgress,
    UserGrammarProgress,
)
from backend.utils.database.settings import set_level
from backend.utils.listening.listening_progress import (
    get_user_hsk_level,
    list_listening_practices_for_user,
    refresh_listening_progress,
)
from postgres_test_case import PostgresTestCase


class TestGetUserHskLevel(PostgresTestCase):
    def test_returns_the_stored_level(self):
        set_level(self.user_id, 3)

        self.assertEqual(get_user_hsk_level(self.user_id), 3)

    def test_defaults_to_one_when_no_level_stored(self):
        self.assertEqual(get_user_hsk_level(self.user_id), 1)


class TestListListeningPracticesForUser(PostgresTestCase):
    def test_filters_to_current_level_plus_one(self):
        set_level(self.user_id, 1)
        db.session.add_all(
            [
                ListeningPractice(id="l1", title="Level 1", hsk_level=1, type="dialog", topic="test"),
                ListeningPractice(id="l2", title="Level 2", hsk_level=2, type="dialog", topic="test"),
                ListeningPractice(id="l3", title="Level 3", hsk_level=3, type="dialog", topic="test"),
            ]
        )
        db.session.commit()

        result = list_listening_practices_for_user(self.user_id)

        self.assertEqual([row["id"] for row in result], ["l1", "l2"])

    def test_no_stored_level_only_shows_level_one(self):
        db.session.add_all(
            [
                ListeningPractice(id="l1", title="Level 1", hsk_level=1, type="dialog", topic="test"),
                ListeningPractice(id="l2", title="Level 2", hsk_level=2, type="dialog", topic="test"),
            ]
        )
        db.session.commit()

        result = list_listening_practices_for_user(self.user_id)

        self.assertEqual([row["id"] for row in result], ["l1"])

    def test_defaults_to_todo_and_zero_scores_without_a_progress_row(self):
        db.session.add(
            ListeningPractice(id="l1", title="Level 1", hsk_level=1, type="dialog", topic="test")
        )
        db.session.commit()

        result = list_listening_practices_for_user(self.user_id)

        self.assertEqual(
            result,
            [
                {
                    "id": "l1",
                    "title": "Level 1",
                    "hsk_level": 1,
                    "type": "dialog",
                    "topic": "test",
                    "translated_topic": "test",
                    "status": "TODO",
                    "vocabulary_score": 0,
                    "grammar_score": 0,
                }
            ],
        )

    def test_reads_existing_progress_row(self):
        db.session.add(
            ListeningPractice(id="l1", title="Level 1", hsk_level=1, type="dialog", topic="test")
        )
        db.session.commit()
        db.session.add(
            ListeningProgress(
                user_id=self.user_id,
                listening_topic="l1",
                vocabulary_score=80,
                grammar_score=50,
                status="DONE",
            )
        )
        db.session.commit()

        result = list_listening_practices_for_user(self.user_id)

        self.assertEqual(
            result[0],
            {
                "id": "l1",
                "title": "Level 1",
                "hsk_level": 1,
                "type": "dialog",
                "topic": "test",
                "translated_topic": "test",
                "status": "DONE",
                "vocabulary_score": 80,
                "grammar_score": 50,
            },
        )

    def test_uses_translated_fields_with_english_fallback(self):
        db.session.add_all(
            [
                ListeningPractice(
                    id="l1", title="Level 1", hsk_level=1, type="dialog", topic="test"
                ),
                ListeningPractice(
                    id="l2", title="Level 2", hsk_level=1, type="dialog", topic="test"
                ),
            ]
        )
        db.session.commit()

        with patch(
            "backend.utils.listening.listening_progress.fetch_listening_practice_translations",
            return_value={
                "l1": {"title": "Niveau 1", "type": "dialogue", "topic": "essai"}
            },
        ) as mock_fetch_translations:
            result = list_listening_practices_for_user(self.user_id, "fr")

        mock_fetch_translations.assert_called_once_with("fr")
        self.assertEqual(
            [row["title"] for row in result], ["Niveau 1", "Level 2"]
        )
        self.assertEqual([row["type"] for row in result], ["dialogue", "dialog"])
        self.assertEqual([row["topic"] for row in result], ["test", "test"])
        self.assertEqual(
            [row["translated_topic"] for row in result], ["essai", "test"]
        )


class TestRefreshListeningProgress(PostgresTestCase):
    def test_creates_todo_row_for_a_never_opened_topic(self):
        db.session.add(
            ListeningPractice(id="l1", title="Level 1", hsk_level=1, type="dialog", topic="test", unique_chars="")
        )
        db.session.commit()

        count = refresh_listening_progress(self.user_id)

        self.assertEqual(count, 1)
        row = ListeningProgress.query.filter_by(
            user_id=self.user_id, listening_topic="l1"
        ).one()
        self.assertEqual(row.status, "TODO")

    def test_keeps_existing_status_but_updates_scores(self):
        db.session.add(
            ListeningPractice(id="l1", title="Level 1", hsk_level=1, type="dialog", topic="test", unique_chars="你好")
        )
        db.session.commit()
        db.session.add(
            ListeningProgress(
                user_id=self.user_id,
                listening_topic="l1",
                status="DONE",
                vocabulary_score=0,
                grammar_score=0,
            )
        )
        db.session.commit()
        db.session.add(Character(user_id=self.user_id, char="你", pinyin_readings=["ni3"]))
        db.session.add(Character(user_id=self.user_id, char="好", pinyin_readings=["hao3"]))
        db.session.commit()

        refresh_listening_progress(self.user_id)

        row = ListeningProgress.query.filter_by(
            user_id=self.user_id, listening_topic="l1"
        ).one()
        self.assertEqual(row.status, "DONE")
        self.assertEqual(row.vocabulary_score, 100)

    def test_computes_vocabulary_score_from_known_characters(self):
        db.session.add(
            ListeningPractice(
                id="l1",
                title="Level 1",
                hsk_level=1,
                type="dialog",
                topic="test",
                unique_chars="你好吗",
            )
        )
        db.session.commit()
        db.session.add(Character(user_id=self.user_id, char="你", pinyin_readings=["ni3"]))
        db.session.commit()

        refresh_listening_progress(self.user_id)

        row = ListeningProgress.query.filter_by(
            user_id=self.user_id, listening_topic="l1"
        ).one()
        # 1 of 3 unique chars known -> round(33.33) == 33
        self.assertEqual(row.vocabulary_score, 33)

    def test_topic_with_no_characters_scores_full_vocabulary(self):
        db.session.add(
            ListeningPractice(id="l1", title="Level 1", hsk_level=1, type="dialog", topic="test", unique_chars="")
        )
        db.session.commit()

        refresh_listening_progress(self.user_id)

        row = ListeningProgress.query.filter_by(
            user_id=self.user_id, listening_topic="l1"
        ).one()
        self.assertEqual(row.vocabulary_score, 100)

    def test_computes_grammar_score_from_completed_grammar_points(self):
        db.session.add(
            ListeningPractice(
                id="l1",
                title="Level 1",
                hsk_level=1,
                type="dialog",
                topic="test",
                grammar_rules="g1,g2,g3,g4",
            )
        )
        db.session.add_all(
            GrammarPoint(id=grammar_id, hsk_level=1, title=grammar_id)
            for grammar_id in ("g1", "g2", "g3", "g4")
        )
        db.session.commit()
        db.session.add_all(
            [
                UserGrammarProgress(user_id=self.user_id, grammar_id="g1", status="DONE"),
                UserGrammarProgress(
                    user_id=self.user_id, grammar_id="g2", status="MASTERED"
                ),
                UserGrammarProgress(user_id=self.user_id, grammar_id="g3", status="WIP"),
            ]
        )
        db.session.commit()

        refresh_listening_progress(self.user_id)

        row = ListeningProgress.query.filter_by(
            user_id=self.user_id, listening_topic="l1"
        ).one()
        # 2 of 4 rules completed (g1 DONE, g2 MASTERED; g3 WIP and g4 untouched don't count)
        self.assertEqual(row.grammar_score, 50)

    def test_topic_with_no_grammar_rules_scores_full_grammar(self):
        db.session.add(
            ListeningPractice(id="l1", title="Level 1", hsk_level=1, type="dialog", topic="test", grammar_rules="")
        )
        db.session.commit()

        refresh_listening_progress(self.user_id)

        row = ListeningProgress.query.filter_by(
            user_id=self.user_id, listening_topic="l1"
        ).one()
        self.assertEqual(row.grammar_score, 100)

    def test_only_refreshes_topics_visible_at_current_level(self):
        set_level(self.user_id, 1)
        db.session.add_all(
            [
                ListeningPractice(id="l1", title="Level 1", hsk_level=1, type="dialog", topic="test"),
                ListeningPractice(id="l3", title="Level 3", hsk_level=3, type="dialog", topic="test"),
            ]
        )
        db.session.commit()

        count = refresh_listening_progress(self.user_id)

        self.assertEqual(count, 1)
        self.assertIsNone(
            ListeningProgress.query.filter_by(
                user_id=self.user_id, listening_topic="l3"
            ).first()
        )
