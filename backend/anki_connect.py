"""Thin HTTP client for the AnkiConnect add-on (localhost:8765)."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any

ANKI_CONNECT_URL = "http://127.0.0.1:8765"
ANKI_CONNECT_VERSION = 6
DEFAULT_TIMEOUT_SECONDS = 3.0


class AnkiConnectError(Exception):
    """Raised when AnkiConnect is unreachable or returns an error."""


def invoke(
    action: str,
    *,
    params: dict[str, Any] | None = None,
    url: str = ANKI_CONNECT_URL,
    timeout: float = DEFAULT_TIMEOUT_SECONDS,
) -> Any:
    payload = {
        "action": action,
        "version": ANKI_CONNECT_VERSION,
        "params": params or {},
    }
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read().decode("utf-8")
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise AnkiConnectError(
            "AnkiConnect is unreachable. Start Anki with the AnkiConnect add-on enabled."
        ) from exc

    try:
        data = json.loads(body)
    except json.JSONDecodeError as exc:
        raise AnkiConnectError("AnkiConnect returned an invalid response.") from exc

    if not isinstance(data, dict):
        raise AnkiConnectError("AnkiConnect returned an invalid response.")

    error = data.get("error")
    if error is not None:
        raise AnkiConnectError(str(error))

    return data.get("result")


def deck_names() -> list[str]:
    result = invoke("deckNames")
    if not isinstance(result, list) or not all(isinstance(name, str) for name in result):
        raise AnkiConnectError("AnkiConnect returned an invalid deck list.")
    return result


def create_deck(deck_name: str) -> Any:
    return invoke("createDeck", params={"deck": deck_name})


def model_names() -> list[str]:
    result = invoke("modelNames")
    if not isinstance(result, list) or not all(isinstance(name, str) for name in result):
        raise AnkiConnectError("AnkiConnect returned an invalid model list.")
    return result


def model_field_names(model_name: str) -> list[str]:
    result = invoke("modelFieldNames", params={"modelName": model_name})
    if not isinstance(result, list) or not all(isinstance(name, str) for name in result):
        raise AnkiConnectError("AnkiConnect returned an invalid field list.")
    return result


def create_model(
    *,
    model_name: str,
    fields: list[str],
    card_templates: list[dict[str, str]],
    css: str | None = None,
) -> Any:
    params: dict[str, Any] = {
        "modelName": model_name,
        "inOrderFields": fields,
        "cardTemplates": card_templates,
        "isCloze": False,
    }
    if css is not None:
        params["css"] = css
    return invoke("createModel", params=params)


def add_notes(
    notes: list[dict[str, Any]],
    *,
    timeout: float = 30.0,
) -> list[Any]:
    """Create notes in Anki. Returns note IDs (null entries for failures)."""
    result = invoke("addNotes", params={"notes": notes}, timeout=timeout)
    if not isinstance(result, list):
        raise AnkiConnectError("AnkiConnect returned an invalid addNotes result.")
    return result


def _quote_anki_query_value(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def find_notes(query: str, *, timeout: float = 30.0) -> list[int]:
    result = invoke("findNotes", params={"query": query}, timeout=timeout)
    if not isinstance(result, list) or not all(isinstance(note_id, int) for note_id in result):
        raise AnkiConnectError("AnkiConnect returned an invalid findNotes result.")
    return result


def notes_info(
    note_ids: list[int],
    *,
    timeout: float = 30.0,
) -> list[dict[str, Any]]:
    if not note_ids:
        return []
    result = invoke("notesInfo", params={"notes": note_ids}, timeout=timeout)
    if not isinstance(result, list) or not all(isinstance(item, dict) for item in result):
        raise AnkiConnectError("AnkiConnect returned an invalid notesInfo result.")
    return result


def field_values_in_deck(
    deck_name: str,
    field_name: str,
    *,
    timeout: float = 30.0,
) -> set[str]:
    """Return the set of non-empty values for a note field in a deck."""
    notes = mapped_notes_in_deck(
        deck_name,
        {"value": field_name},
        timeout=timeout,
    )
    return {note["value"] for note in notes if note.get("value", "").strip() != ""}


def mapped_notes_in_deck(
    deck_name: str,
    logical_to_anki: dict[str, str],
    *,
    timeout: float = 30.0,
) -> list[dict[str, str]]:
    """Return notes in a deck with values keyed by logical field names."""
    query = f"deck:{_quote_anki_query_value(deck_name)}"
    note_ids = find_notes(query, timeout=timeout)
    notes: list[dict[str, str]] = []
    chunk_size = 250
    for start in range(0, len(note_ids), chunk_size):
        chunk = note_ids[start : start + chunk_size]
        for info in notes_info(chunk, timeout=timeout):
            fields = info.get("fields")
            if not isinstance(fields, dict):
                continue
            mapped: dict[str, str] = {}
            for logical_key, anki_field in logical_to_anki.items():
                field = fields.get(anki_field)
                if isinstance(field, dict):
                    raw = field.get("value")
                else:
                    raw = field
                mapped[logical_key] = raw.strip() if isinstance(raw, str) else ""
            notes.append(mapped)
    return notes


def is_connected() -> bool:
    try:
        deck_names()
        return True
    except AnkiConnectError:
        return False
