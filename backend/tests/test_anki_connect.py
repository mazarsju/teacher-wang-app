import bootstrap  # noqa: F401
import json
import unittest
from unittest.mock import MagicMock, patch
from urllib.error import URLError

from backend.anki_connect import AnkiConnectError, deck_names, invoke, is_connected


class TestAnkiConnectClient(unittest.TestCase):
    def test_invoke_returns_result(self):
        response = MagicMock()
        response.read.return_value = json.dumps(
            {"result": ["Default"], "error": None}
        ).encode("utf-8")
        response.__enter__.return_value = response
        response.__exit__.return_value = False

        with patch("backend.anki_connect.urllib.request.urlopen", return_value=response):
            result = invoke("deckNames")

        self.assertEqual(result, ["Default"])

    def test_invoke_raises_on_connection_error(self):
        with patch(
            "backend.anki_connect.urllib.request.urlopen",
            side_effect=URLError("refused"),
        ):
            with self.assertRaises(AnkiConnectError):
                invoke("deckNames")

    def test_invoke_raises_on_anki_error_field(self):
        response = MagicMock()
        response.read.return_value = json.dumps(
            {"result": None, "error": "unsupported action"}
        ).encode("utf-8")
        response.__enter__.return_value = response
        response.__exit__.return_value = False

        with patch("backend.anki_connect.urllib.request.urlopen", return_value=response):
            with self.assertRaises(AnkiConnectError):
                invoke("deckNames")

    def test_deck_names_and_is_connected(self):
        with patch("backend.anki_connect.invoke", return_value=["A", "B"]):
            self.assertEqual(deck_names(), ["A", "B"])
            self.assertTrue(is_connected())

        with patch(
            "backend.anki_connect.invoke",
            side_effect=AnkiConnectError("down"),
        ):
            self.assertFalse(is_connected())

    def test_add_notes_invokes_anki_connect(self):
        from backend.anki_connect import add_notes

        notes = [
            {
                "deckName": "Vocab",
                "modelName": "Basic",
                "fields": {"Front": "a", "Back": "b"},
            }
        ]
        with patch("backend.anki_connect.invoke", return_value=[1]) as mock_invoke:
            result = add_notes(notes)

        self.assertEqual(result, [1])
        mock_invoke.assert_called_once_with(
            "addNotes",
            params={"notes": notes},
            timeout=30.0,
        )

    def test_field_values_in_deck_reads_notes_info(self):
        from backend.anki_connect import field_values_in_deck

        with (
            patch(
                "backend.anki_connect.find_notes",
                return_value=[1, 2],
            ) as mock_find,
            patch(
                "backend.anki_connect.notes_info",
                return_value=[
                    {"fields": {"writting": {"value": "水", "order": 0}}},
                    {"fields": {"writting": {"value": " 火 ", "order": 0}}},
                ],
            ) as mock_info,
        ):
            values = field_values_in_deck("My Vocab", "writting")

        mock_find.assert_called_once_with('deck:"My Vocab"', timeout=30.0)
        mock_info.assert_called_once_with([1, 2], timeout=30.0)
        self.assertEqual(values, {"水", "火"})


if __name__ == "__main__":
    unittest.main()
