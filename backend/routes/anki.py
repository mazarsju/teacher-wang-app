from flask import Blueprint, request

from backend import anki_connect, anki_sync
from backend.anki_connect import AnkiConnectError

bp = Blueprint("anki", __name__)

VALID_KINDS = frozenset({"mandarin_vocabulary", "mandarin_writting"})


@bp.get("/anki/status")
def get_anki_status():
    return anki_sync.get_anki_status(), 200


@bp.get("/anki/decks")
def list_anki_decks():
    try:
        decks = anki_connect.deck_names()
    except AnkiConnectError as exc:
        return {"error": str(exc)}, 503

    return {"decks": decks}, 200


@bp.get("/anki/models")
def list_anki_models():
    try:
        models = anki_connect.model_names()
    except AnkiConnectError as exc:
        return {"error": str(exc)}, 503

    return {"models": models}, 200


@bp.get("/anki/models/<path:model_name>/fields")
def list_anki_model_fields(model_name: str):
    try:
        fields = anki_connect.model_field_names(model_name)
    except AnkiConnectError as exc:
        return {"error": str(exc)}, 503

    return {"fields": fields}, 200


@bp.post("/anki/decks/setup")
def setup_anki_deck():
    data = request.get_json(silent=True)
    if data is None:
        return {"error": "Invalid JSON body"}, 400

    if not isinstance(data, dict):
        return {"error": "Request body must be a JSON object"}, 400

    kind = data.get("kind")
    deck_name = data.get("deck_name")
    model_name = data.get("model_name")
    fields = data.get("fields")
    create = data.get("create", False)

    if kind not in VALID_KINDS:
        return {"error": 'kind must be "mandarin_vocabulary" or "mandarin_writting"'}, 400

    if not isinstance(deck_name, str) or deck_name.strip() == "":
        return {"error": "deck_name must be a non-empty string"}, 400

    if not isinstance(model_name, str) or model_name.strip() == "":
        return {"error": "model_name must be a non-empty string"}, 400

    if not isinstance(fields, dict):
        return {"error": "fields must be an object"}, 400

    if not isinstance(create, bool):
        return {"error": "create must be a boolean"}, 400

    try:
        deck = anki_sync.setup_deck(
            kind,
            deck_name,
            model_name=model_name,
            fields=fields,
            create=create,
        )
    except AnkiConnectError as exc:
        return {"error": str(exc)}, 503
    except ValueError as exc:
        return {"error": str(exc)}, 400

    return {"kind": kind, "deck": deck}, 200


@bp.post("/anki/vocabulary/auto-setup")
def auto_setup_vocabulary():
    data = request.get_json(silent=True)
    if data is None:
        return {"error": "Invalid JSON body"}, 400

    if not isinstance(data, dict):
        return {"error": "Request body must be a JSON object"}, 400

    deck_name = data.get("deck_name")
    model_name = data.get("model_name")
    optional_fields = data.get("optional_fields", [])

    if not isinstance(deck_name, str) or deck_name.strip() == "":
        return {"error": "deck_name must be a non-empty string"}, 400

    if not isinstance(model_name, str) or model_name.strip() == "":
        return {"error": "model_name must be a non-empty string"}, 400

    if optional_fields is not None and not isinstance(optional_fields, list):
        return {"error": "optional_fields must be an array of strings"}, 400

    try:
        deck = anki_sync.create_vocabulary_three_direction_setup(
            deck_name=deck_name,
            model_name=model_name,
            optional_fields=optional_fields,
        )
    except AnkiConnectError as exc:
        return {"error": str(exc)}, 503
    except ValueError as exc:
        return {"error": str(exc)}, 400

    return {"kind": "mandarin_vocabulary", "deck": deck}, 200
