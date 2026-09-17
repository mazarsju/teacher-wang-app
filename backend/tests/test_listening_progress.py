import bootstrap  # noqa: F401
from backend.utils.database.extensions import db
from backend.utils.database.models import (
    Character,
    GrammarPoint,
    ListeningPractice,
    ListeningProgress,
    UserGrammarProgress,
)
from backend.utils.listening.listening_progress import (
    refresh_and_list_listening_practices_for_level,
)
from postgres_test_case import PostgresTestCase


class TestRefreshAndListListeningPracticesForLevel(PostgresTestCase):
    def test_scopes_to_the_requested_level_only(self):
        db.session.add_all(
            [
                ListeningPractice(id="l1", title="Level 1", hsk_level=1, type="dialog", topic="test"),
                ListeningPractice(id="l2", title="Level 2", hsk_level=2, type="dialog", topic="test"),
            ]
        )
        db.session.commit()

        result = refresh_and_list_listening_practices_for_level(self.user_id, 1)

        self.assertEqual([row["id"] for row in result], ["l1"])

    def test_creates_todo_row_for_a_never_opened_topic(self):
        db.session.add(
            ListeningPractice(id="l1", title="Level 1", hsk_level=1, type="dialog", topic="test", unique_chars="")
        )
        db.session.commit()

        result = refresh_and_list_listening_practices_for_level(self.user_id, 1)

        self.assertEqual(
            result,
            [{"id": "l1", "status": "TODO", "vocabulary_score": 100, "grammar_score": 100}],
        )
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

        result = refresh_and_list_listening_practices_for_level(self.user_id, 1)

        self.assertEqual(result[0]["status"], "DONE")
        self.assertEqual(result[0]["vocabulary_score"], 100)
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

        result = refresh_and_list_listening_practices_for_level(self.user_id, 1)

        # 1 of 3 unique chars known -> round(33.33) == 33
        self.assertEqual(result[0]["vocabulary_score"], 33)

    def test_topic_with_no_characters_scores_full_vocabulary(self):
        db.session.add(
            ListeningPractice(id="l1", title="Level 1", hsk_level=1, type="dialog", topic="test", unique_chars="")
        )
        db.session.commit()

        result = refresh_and_list_listening_practices_for_level(self.user_id, 1)

        self.assertEqual(result[0]["vocabulary_score"], 100)

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

        result = refresh_and_list_listening_practices_for_level(self.user_id, 1)

        # 2 of 4 rules completed (g1 DONE, g2 MASTERED; g3 WIP and g4 untouched don't count)
        self.assertEqual(result[0]["grammar_score"], 50)

    def test_topic_with_no_grammar_rules_scores_full_grammar(self):
        db.session.add(
            ListeningPractice(id="l1", title="Level 1", hsk_level=1, type="dialog", topic="test", grammar_rules="")
        )
        db.session.commit()

        result = refresh_and_list_listening_practices_for_level(self.user_id, 1)

        self.assertEqual(result[0]["grammar_score"], 100)

    def test_does_not_touch_progress_rows_for_other_levels(self):
        db.session.add_all(
            [
                ListeningPractice(id="l1", title="Level 1", hsk_level=1, type="dialog", topic="test"),
                ListeningPractice(id="l3", title="Level 3", hsk_level=3, type="dialog", topic="test"),
            ]
        )
        db.session.commit()

        result = refresh_and_list_listening_practices_for_level(self.user_id, 1)

        self.assertEqual([row["id"] for row in result], ["l1"])
        self.assertIsNone(
            ListeningProgress.query.filter_by(
                user_id=self.user_id, listening_topic="l3"
            ).first()
        )
