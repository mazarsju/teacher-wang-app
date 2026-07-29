import bootstrap  # noqa: F401
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from backend.extensions import db
from backend.models import HskCharacter, HskWord, Setting, hsk_word_character  # noqa: F401
from backend.settings import SETTING_LEVEL, get_setting
from backend.routes.hsk_content_loader import load_hsk_content, reload_hsk_content
from backend.routes.hsk_source import (
    COMPLETE_HSK_JSON_URL,
    HSK_FALLBACK_PATH,
    fetch_complete_hsk_entries,
    load_complete_hsk_entries,
    load_fallback_hsk_entries,
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

    def test_words_by_new_level_keeps_only_new_and_sorts(self) -> None:
        lists = words_by_new_level(self.entries)

        self.assertEqual(lists[0], [("爱", 50), ("爱好", 100)])
        self.assertEqual(lists[1], [("啊", 47)])
        self.assertEqual(lists[2], [])
        self.assertEqual(lists[3], [("阿姨", 4355)])
        self.assertEqual(lists[6], [("呵护", 13381), ("阿拉伯语", 27202)])

    def test_words_by_new_level_ignores_old_and_newest_only(self) -> None:
        lists = words_by_new_level(self.entries)
        all_words = [word for rows in lists for word, _ in rows]
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


class TestLoadHskContent(PostgresTestCase):
    def setUp(self) -> None:
        super().setUp()
        self.entries = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))

    def test_load_keeps_lowest_level_and_links_characters(self) -> None:
        counts = load_hsk_content(self.entries)

        self.assertEqual(counts["hsk-1"], 2)
        self.assertEqual(counts["hsk-2"], 1)
        self.assertEqual(counts["hsk-4"], 1)
        self.assertEqual(counts["hsk-7"], 2)
        self.assertEqual(HskWord.query.count(), 6)
        self.assertEqual(HskCharacter.query.count(), 10)
        self.assertEqual(get_setting(SETTING_LEVEL), "")
        self.assertIsNotNone(db.session.get(Setting, SETTING_LEVEL))

        good = HskCharacter.query.filter_by(character="好").one()
        self.assertEqual(good.level, 1)
        self.assertEqual(good.frequency, 100)

        hobby = HskWord.query.filter_by(word="爱好").one()
        self.assertEqual(hobby.level, 1)
        self.assertEqual({char.character for char in hobby.characters}, {"爱", "好"})

    def test_load_rejects_non_han(self) -> None:
        with self.assertRaises(ValueError):
            load_hsk_content(
                [{"simplified": "A", "level": ["new-1"], "frequency": 1}]
            )

    def test_reload_clears_existing_rows(self) -> None:
        db.session.add(HskWord(word="旧词", level=3, frequency=1))
        db.session.add(HskCharacter(character="旧", level=3, frequency=99))
        db.session.commit()

        reload_hsk_content(
            [{"simplified": "爱", "level": ["new-1"], "frequency": 10}]
        )

        self.assertEqual(HskWord.query.count(), 1)
        self.assertEqual(HskCharacter.query.count(), 1)
        self.assertIsNone(HskWord.query.filter_by(word="旧词").first())
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
        self.assertEqual(counts["hsk-1"], 2)


if __name__ == "__main__":
    unittest.main()
