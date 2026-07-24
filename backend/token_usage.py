"""Persist and query LLM token usage events."""

from __future__ import annotations

import json
import os
from datetime import date, datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

from sqlalchemy import func

from backend.extensions import db
from backend.llm import LLM_MODEL_ENV
from backend.llm_config import read_llm_config
from backend.models import TokenCount, utcnow

TOKEN_HISTORY_DAYS = 7
TOKEN_TYPE_INPUT = "input"
TOKEN_TYPE_OUTPUT = "output"
VALID_TOKEN_TYPES = {TOKEN_TYPE_INPUT, TOKEN_TYPE_OUTPUT}
PRICE_CENTS_QUANTIZE = Decimal("0.00001")
TOKENS_PER_MILLION = Decimal("1000000")
USD_TO_CENTS = Decimal("100")

TOKEN_PRICE_PATH = Path(
    os.environ.get(
        "TOKEN_PRICE_PATH",
        Path(__file__).resolve().parent / "token_price.json",
    )
)


def load_token_prices() -> list[dict]:
    if not TOKEN_PRICE_PATH.is_file():
        raise ValueError(f"Token price file not found: {TOKEN_PRICE_PATH}")

    payload = json.loads(TOKEN_PRICE_PATH.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        raise ValueError("token_price.json must contain a JSON array")
    return payload


def find_model_price(model_name: str) -> dict:
    normalized = model_name.strip().lower()
    if normalized == "":
        raise ValueError("LLM model name is required to compute token price")

    for entry in load_token_prices():
        if not isinstance(entry, dict):
            continue
        entry_model = str(entry.get("modelName", "")).strip().lower()
        if entry_model == normalized:
            return entry

    raise ValueError(f"No token price found for model {model_name!r}")


def usd_per_million_for_type(entry: dict, token_type: str) -> Decimal:
    if token_type == TOKEN_TYPE_INPUT:
        key = "inputPrice"
    elif token_type == TOKEN_TYPE_OUTPUT:
        key = "outputPrice"
    else:
        raise ValueError(f"Invalid token type: {token_type}")

    raw = entry.get(key)
    if not isinstance(raw, (int, float)) or isinstance(raw, bool):
        raise ValueError(f"Invalid {key} for model {entry.get('modelName')!r}")
    if raw < 0:
        raise ValueError(f"{key} must be non-negative")
    return Decimal(str(raw))


def compute_price_cents(tokens: int, usd_per_million: Decimal | float | int) -> Decimal:
    """Return cost in USD cents for ``tokens`` at a per-million USD rate."""
    if tokens < 0:
        raise ValueError("tokens must be non-negative")

    rate = (
        usd_per_million
        if isinstance(usd_per_million, Decimal)
        else Decimal(str(usd_per_million))
    )
    price_cents = (Decimal(tokens) * rate * USD_TO_CENTS) / TOKENS_PER_MILLION
    return price_cents.quantize(PRICE_CENTS_QUANTIZE, rounding=ROUND_HALF_UP)


def _price_for_tokens(tokens: int, token_type: str, model_name: str | None = None) -> Decimal:
    model = model_name
    if model is None:
        model = read_llm_config().get(LLM_MODEL_ENV, "").strip()
    entry = find_model_price(model)
    rate = usd_per_million_for_type(entry, token_type)
    return compute_price_cents(tokens, rate)


def _next_available_timestamp(recorded_at: datetime) -> datetime:
    candidate = recorded_at
    while (
        db.session.get(TokenCount, (candidate, TOKEN_TYPE_INPUT)) is not None
        or db.session.get(TokenCount, (candidate, TOKEN_TYPE_OUTPUT)) is not None
    ):
        candidate = candidate + timedelta(microseconds=1)
    return candidate


def _add_token_row(
    recorded_at: datetime,
    token_type: str,
    tokens: int,
    *,
    model_name: str | None = None,
) -> TokenCount:
    if token_type not in VALID_TOKEN_TYPES:
        raise ValueError(f"Invalid token type: {token_type}")
    if tokens < 0:
        raise ValueError("tokens must be non-negative")

    price = _price_for_tokens(tokens, token_type, model_name=model_name)
    row = TokenCount(
        recorded_at=recorded_at,
        type=token_type,
        tokens=tokens,
        price=price,
    )
    db.session.add(row)
    return row


def record_token_usage(
    input_tokens: int = 0,
    output_tokens: int = 0,
    *,
    model_name: str | None = None,
    commit: bool = True,
) -> list[TokenCount]:
    """Insert input/output token usage rows with computed prices. Zero counts are skipped."""
    if input_tokens < 0 or output_tokens < 0:
        raise ValueError("tokens must be non-negative")

    rows: list[TokenCount] = []
    if input_tokens == 0 and output_tokens == 0:
        return rows

    recorded_at = _next_available_timestamp(utcnow())
    if input_tokens > 0:
        rows.append(
            _add_token_row(
                recorded_at,
                TOKEN_TYPE_INPUT,
                input_tokens,
                model_name=model_name,
            )
        )
    if output_tokens > 0:
        rows.append(
            _add_token_row(
                recorded_at,
                TOKEN_TYPE_OUTPUT,
                output_tokens,
                model_name=model_name,
            )
        )

    if commit:
        db.session.commit()
    else:
        db.session.flush()
    return rows


def get_total_tokens() -> int:
    total = db.session.query(func.coalesce(func.sum(TokenCount.tokens), 0)).scalar()
    return int(total or 0)


def get_total_price_cents() -> Decimal:
    total = db.session.query(func.coalesce(func.sum(TokenCount.price), 0)).scalar()
    return Decimal(str(total or 0))


def get_total_cost_usd() -> float:
    """Total recorded cost in USD (price column is stored in cents)."""
    return float(get_total_price_cents() / USD_TO_CENTS)


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def get_daily_usage(days: int = TOKEN_HISTORY_DAYS) -> list[dict[str, int | str]]:
    """Return one entry per calendar day for the last ``days`` days (UTC)."""
    if days < 1:
        raise ValueError("days must be at least 1")

    today = utcnow().date()
    start_day = today - timedelta(days=days - 1)
    start_at = datetime.combine(start_day, datetime.min.time(), tzinfo=timezone.utc)

    rows = (
        TokenCount.query.filter(TokenCount.recorded_at >= start_at)
        .order_by(TokenCount.recorded_at.asc())
        .all()
    )

    totals_by_day: dict[date, int] = {
        start_day + timedelta(days=offset): 0 for offset in range(days)
    }
    for row in rows:
        day = _as_utc(row.recorded_at).date()
        if day in totals_by_day:
            totals_by_day[day] += row.tokens

    return [
        {
            "date": day.isoformat(),
            "tokens": totals_by_day[day],
        }
        for day in sorted(totals_by_day)
    ]


def get_token_usage_summary(days: int = TOKEN_HISTORY_DAYS) -> dict:
    return {
        "total_tokens": get_total_tokens(),
        "total_cost_usd": get_total_cost_usd(),
        "days": get_daily_usage(days),
    }
