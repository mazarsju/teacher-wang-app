import bootstrap  # noqa: F401
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from backend.extensions import db
from backend.models import HskCharacter, HskWord, hsk_word_character  # noqa: F401
from backend.routes.hsk_content_loader import (
    _syllable_for_character,
    load_hsk_content,
    reload_hsk_content,
)
from backend.routes.hsk_source import (
    COMPLETE_HSK_JSON_URL,
    HSK_FALLBACK_PATH,
    HskWordForm,
    fetch_complete_hsk_entries,
    load_complete_hsk_entries,
    load_fallback_hsk_entries,
    make_hsk_word_id,
    normalize_hsk_numeric_pinyin,
    words_by_new_level,
)
from postgres_test_case import PostgresTestCase

FIXTURE_PATH = (
    Path(__file__).resolve().parents[1]
    / "routes"
    / "fixtures"
    / "sample-complete.json"
)


class TestHskSource(unittest.TestCase):
    def setUp(self) -> None:
        self.entries = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))

    def test_normalize_hsk_numeric_pinyin(self) -> None:
        self.assertEqual(normalize_hsk_numeric_pinyin("A1 la1 bo2 yu3"), "a1 la1 bo2 yu3")
        self.assertEqual(normalize_hsk_numeric_pinyin("ai4 hao4"), "ai4 hao4")
        self.assertEqual(normalize_hsk_numeric_pinyin("a5"), "a")
        self.assertEqual(normalize_hsk_numeric_pinyin("ai4 ren5"), "ai4 ren")

    def test_words_by_new_level_expands_forms_and_sorts(self) -> None:
        lists = words_by_new_level(self.entries)

        self.assertEqual(
            lists[0],
            [
                HskWordForm(
                    word="上",
                    frequency=29,
                    pinyin="shang3",
                    definition="used in 上声",
                ),
                HskWordForm(
                    word="上",
                    frequency=29,
                    pinyin="shang4",
                    definition=(
                        "(bound form) up; upper; above; previous | "
                        "to climb; to get onto; to go up"
                    ),
                ),
                HskWordForm(
                    word="爱",
                    frequency=50,
                    pinyin="ai4",
                    definition="to love | affection | to be fond of | to like",
                ),
                HskWordForm(
                    word="爱好",
                    frequency=100,
                    pinyin="ai4 hao4",
                    definition=(
                        "to like | to take pleasure in | keen on | fond of | "
                        "interest | hobby | appetite"
                    ),
                ),
            ],
        )
        self.assertEqual(
            [form.pinyin for form in lists[1]],
            ["a", "a1", "a2", "chi1", "li2"],
        )
        self.assertEqual(lists[2], [])
        self.assertEqual(lists[3][0].word, "阿姨")
        self.assertEqual(lists[3][0].pinyin, "a1 yi2")
        self.assertEqual(
            [(form.word, form.pinyin) for form in lists[6]],
            [("呵护", "he1 hu4"), ("阿拉伯语", "a1 la1 bo2 yu3")],
        )

    def test_forms_with_same_pinyin_merge_meanings(self) -> None:
        lists = words_by_new_level(self.entries)
        li_forms = [form for form in lists[1] if form.word == "离"]

        self.assertEqual(
            li_forms,
            [
                HskWordForm(
                    word="离",
                    frequency=912,
                    pinyin="chi1",
                    definition="mythical beast (archaic)",
                ),
                HskWordForm(
                    word="离",
                    frequency=912,
                    pinyin="li2",
                    definition=(
                        "surname Li | to leave | to part from | "
                        "to be away from | (in giving distances) from"
                    ),
                ),
            ],
        )

    def test_words_by_new_level_ignores_old_and_newest_only(self) -> None:
        lists = words_by_new_level(self.entries)
        all_words = [form.word for rows in lists for form in rows]
        self.assertNotIn("呵", all_words)

    def test_fetch_downloads_upstream_json(self) -> None:
        payload = json.dumps(self.entries).encode("utf-8")
        mock_response = MagicMock()
        mock_response.read.return_value = payload
        mock_response.__enter__.return_value = mock_response
        mock_response.__exit__.return_value = None

        with patch(
            "backend.routes.hsk_source.urlopen",
            return_value=mock_response,
        ) as mock_urlopen:
            entries = fetch_complete_hsk_entries()

        mock_urlopen.assert_called_once_with(COMPLETE_HSK_JSON_URL)
        self.assertEqual(entries, self.entries)

    def test_load_from_local_path(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "complete.json"
            path.write_text(json.dumps(self.entries), encoding="utf-8")
            self.assertEqual(load_complete_hsk_entries(path), self.entries)

    def test_falls_back_to_bundled_hsk_json_when_download_fails(self) -> None:
        with patch(
            "backend.routes.hsk_source.fetch_complete_hsk_entries",
            side_effect=OSError("network down"),
        ):
            entries = load_complete_hsk_entries()

        self.assertGreater(len(entries), 0)
        self.assertEqual(
            set(entries[0]),
            {"simplified", "level", "frequency"},
        )
        self.assertTrue(
            all(
                level.startswith("new-")
                for entry in entries
                for level in entry["level"]
            )
        )
        self.assertEqual(entries, load_fallback_hsk_entries(HSK_FALLBACK_PATH))


class TestSyllableForCharacter(unittest.TestCase):
    def test_returns_the_syllable_at_index(self) -> None:
        self.assertEqual(_syllable_for_character(["ai4", "hao4"], 1), "hao4")

    def test_returns_empty_string_when_index_out_of_range(self) -> None:
        self.assertEqual(_syllable_for_character(["ai4"], 1), "")

    def test_returns_empty_string_for_oversized_syllable(self) -> None:
        self.assertEqual(_syllable_for_character(["diàndòngchē"], 0), "")


class TestLoadHskContent(PostgresTestCase):
    def setUp(self) -> None:
        super().setUp()
        self.entries = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))

    def test_load_keeps_lowest_level_and_links_characters(self) -> None:
        counts = load_hsk_content(self.entries)

        # Effective levels after multi-reading corrections (啊 a1/a2→3, 离 chi1→7,
        # 上 shang3→6).
        self.assertEqual(counts["hsk-1"], 3)  # 上/shang4, 爱, 爱好
        self.assertEqual(counts["hsk-2"], 2)  # 啊/a, 离/li2
        self.assertEqual(counts["hsk-3"], 2)  # 啊/a1, 啊/a2
        self.assertEqual(counts["hsk-4"], 1)  # 阿姨
        self.assertEqual(counts["hsk-6"], 1)  # 上/shang3
        self.assertEqual(counts["hsk-7"], 3)  # 离/chi1, 呵护, 阿拉伯语
        # 爱, 爱好, 上×2, 啊×3, 离×2, 阿姨, 呵护, 阿拉伯语
        self.assertEqual(HskWord.query.count(), 12)
        self.assertEqual(HskCharacter.query.count(), 12)

        leave = HskWord.query.filter_by(word="离", pinyin="li2").one()
        self.assertTrue(leave.definition.startswith("surname Li | to leave"))
        self.assertEqual(leave.level, 2)
        self.assertEqual(
            HskWord.query.filter_by(word="离", pinyin="chi1").one().level, 7
        )

        above = HskWord.query.filter_by(word="上", pinyin="shang4").one()
        self.assertEqual(above.level, 1)
        self.assertEqual(
            HskWord.query.filter_by(word="上", pinyin="shang3").one().level, 6
        )
        # Character level follows the lowest effective word reading.
        above = HskCharacter.query.filter_by(character="上").one()
        self.assertEqual(above.level, 1)
        # most_used_pinyin follows the same winning (lowest level, then
        # frequency) reading: 上/shang4 (level 1) beats 上/shang3 (level 6).
        self.assertEqual(above.most_used_pinyin, "shang4")

        good = HskCharacter.query.filter_by(character="好").one()
        self.assertEqual(good.level, 1)
        self.assertEqual(good.frequency, 100)
        self.assertEqual(good.most_used_pinyin, "hao4")

        love = HskCharacter.query.filter_by(character="爱").one()
        # 爱 (frequency 50) wins over 爱好 (frequency 100) at the same level.
        self.assertEqual(love.most_used_pinyin, "ai4")

        hobby = HskWord.query.filter_by(word="爱好").one()
        self.assertEqual(hobby.id, make_hsk_word_id("爱好", "ai4 hao4"))
        self.assertEqual(hobby.pinyin, "ai4 hao4")
        self.assertIn("hobby", hobby.definition)
        self.assertEqual(hobby.level, 1)
        self.assertEqual({char.character for char in hobby.characters}, {"爱", "好"})

        ah_rows = HskWord.query.filter_by(word="啊").order_by(HskWord.pinyin).all()
        self.assertEqual([row.pinyin for row in ah_rows], ["a", "a1", "a2"])
        self.assertEqual([row.level for row in ah_rows], [2, 3, 3])

    def test_load_rejects_non_han(self) -> None:
        with self.assertRaises(ValueError):
            load_hsk_content(
                [{"simplified": "A", "level": ["new-1"], "frequency": 1}]
            )

    def test_load_tolerates_unsplit_transcription(self) -> None:
        # Real upstream bug: 电动车's "numeric" transcription is the accented
        # "diàndòngchē" instead of "dian4 dong4 che1" — one token spanning all
        # three characters. Loading it must not crash the whole reload, and
        # the malformed reading must not overflow most_used_pinyin's column.
        load_hsk_content(
            [
                {
                    "simplified": "电动车",
                    "level": ["new-4"],
                    "frequency": 26291,
                    "forms": [
                        {
                            "transcriptions": {"numeric": "diàndòngchē"},
                            "meanings": ["Electric vehicle"],
                        }
                    ],
                }
            ]
        )

        for char in "电动车":
            self.assertEqual(
                HskCharacter.query.filter_by(character=char).one().most_used_pinyin,
                "",
            )

    def test_reload_clears_existing_rows(self) -> None:
        db.session.add(
            HskWord(
                id=make_hsk_word_id("旧词", "jiu4"),
                word="旧词",
                level=3,
                frequency=1,
                pinyin="jiu4",
                definition="old",
            )
        )
        db.session.add(HskCharacter(character="旧", level=3, frequency=99))
        db.session.commit()

        reload_hsk_content(
            [
                {
                    "simplified": "爱",
                    "level": ["new-1"],
                    "frequency": 10,
                    "forms": [
                        {
                            "transcriptions": {"numeric": "ai4"},
                            "meanings": ["to love"],
                        }
                    ],
                }
            ]
        )

        self.assertEqual(HskWord.query.count(), 1)
        self.assertEqual(HskCharacter.query.count(), 1)
        self.assertIsNone(HskWord.query.filter_by(word="旧词").first())
        loaded = HskWord.query.filter_by(word="爱").one()
        self.assertEqual(loaded.pinyin, "ai4")
        self.assertEqual(loaded.definition, "to love")
        self.assertEqual(
            HskCharacter.query.filter_by(character="爱").one().frequency, 10
        )

    def test_load_downloads_when_entries_omitted(self) -> None:
        with patch(
            "backend.routes.hsk_content_loader.load_complete_hsk_entries",
            return_value=self.entries,
        ) as mock_load:
            counts = load_hsk_content()

        mock_load.assert_called_once_with()
        self.assertEqual(counts["hsk-1"], 3)


if __name__ == "__main__":
    unittest.main()
