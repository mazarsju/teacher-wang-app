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


if __name__ == "__main__":
    unittest.main()
