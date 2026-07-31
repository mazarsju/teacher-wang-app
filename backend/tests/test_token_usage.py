import bootstrap  # noqa: F401
import json
import unittest
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from backend.extensions import db
from backend.models import TokenCount
from backend.token_usage import (
    TOKEN_TYPE_INPUT,
    TOKEN_TYPE_OUTPUT,
    compute_price_cents,
    get_daily_usage,
    get_token_usage_summary,
    get_total_tokens,
    record_token_usage,
)
from postgres_test_case import PostgresTestCase


class TestTokenUsage(PostgresTestCase):
    def setUp(self):
        super().setUp()

        self.temp_dir = TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.price_path = Path(self.temp_dir.name) / "token_price.json"
        self.price_path.write_text(
            json.dumps(
                [
                    {
                        "companyName": "openai",
                        "modelName": "gpt-4o-mini",
                        "inputPrice": 0.15,
                        "outputPrice": 0.6,
                    }
                ]
            ),
            encoding="utf-8",
        )
        self.price_patcher = patch(
            "backend.token_usage.TOKEN_PRICE_PATH",
            self.price_path,
        )
        self.price_patcher.start()
        self.addCleanup(self.price_patcher.stop)
        self.model_patcher = patch(
            "backend.token_usage.read_llm_config",
            return_value={"LLM_MODEL": "gpt-4o-mini"},
        )
        self.model_patcher.start()
        self.addCleanup(self.model_patcher.stop)

    def test_compute_price_cents_uses_per_million_usd_rate(self):
        # 1M tokens at $0.15 / 1M = $0.15 = 15 cents
        self.assertEqual(compute_price_cents(1_000_000, 0.15), Decimal("15.00000"))
        # 1_000 tokens at $0.15 / 1M = 0.015 cents
        self.assertEqual(compute_price_cents(1_000, 0.15), Decimal("0.01500"))

    def test_record_token_usage_persists_input_and_output_rows_with_price(self):
        rows = record_token_usage(self.user_id, input_tokens=1000, output_tokens=500)
        self.assertEqual(len(rows), 2)
        self.assertEqual(get_total_tokens(self.user_id), 1500)
        self.assertEqual(TokenCount.query.count(), 2)

        by_type = {row.type: row for row in TokenCount.query.all()}
        self.assertEqual(by_type[TOKEN_TYPE_INPUT].price, Decimal("0.01500"))
        # 500 * 0.6 * 100 / 1_000_000 = 0.03
        self.assertEqual(by_type[TOKEN_TYPE_OUTPUT].price, Decimal("0.03000"))

    def test_record_token_usage_ignores_zero(self):
        self.assertEqual(record_token_usage(self.user_id, 0, 0), [])
        self.assertEqual(TokenCount.query.count(), 0)

    def test_daily_usage_fills_last_seven_days(self):
        now = datetime.now(timezone.utc)
        db.session.add(
            TokenCount(
                user_id=self.user_id,
                recorded_at=now - timedelta(days=1),
                type=TOKEN_TYPE_INPUT,
                tokens=20,
                price=Decimal("0.00030"),
            )
        )
        db.session.add(
            TokenCount(
                user_id=self.user_id,
                recorded_at=now,
                type=TOKEN_TYPE_OUTPUT,
                tokens=15,
                price=Decimal("0.00090"),
            )
        )
        db.session.add(
            TokenCount(
                user_id=self.user_id,
                recorded_at=now - timedelta(days=8),
                type=TOKEN_TYPE_INPUT,
                tokens=99,
                price=Decimal("0.00149"),
            )
        )
        db.session.commit()

        days = get_daily_usage(self.user_id, 7)
        self.assertEqual(len(days), 7)
        self.assertEqual(days[-1]["tokens"], 15)
        self.assertEqual(days[-2]["tokens"], 20)
        self.assertEqual(sum(day["tokens"] for day in days), 35)

        summary = get_token_usage_summary(self.user_id)
        self.assertEqual(summary["total_tokens"], 134)
        # (0.00030 + 0.00090 + 0.00149) cents / 100 = 0.0000269 USD
        self.assertAlmostEqual(summary["total_cost_usd"], 0.0000269, places=10)
        self.assertEqual(summary["plan"], "free")
        self.assertEqual(summary["available_token"], 100_000)
        self.assertEqual(summary["max_allowed_token"], 100_000)


if __name__ == "__main__":
    unittest.main()
