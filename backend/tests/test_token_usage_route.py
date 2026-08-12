import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock, patch

import backend.utils.database.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.app import app  # noqa: E402
from auth_stub import authenticated_client, patch_request_auth  # noqa: E402


class TestTokenUsageEndpoint(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)
        self.summary_patcher = patch(
            "backend.routes.token_usage.get_token_usage_summary"
        )
        self.mock_summary = self.summary_patcher.start()
        self.addCleanup(self.summary_patcher.stop)

    def test_get_token_usage_returns_summary(self):
        self.mock_summary.return_value = {
            "total_tokens": 120,
            "total_cost_usd": 0.000435,
            "plan": "free",
            "available_token": 99880,
            "max_allowed_token": 100000,
            "days": [{"date": "2026-07-24", "tokens": 40}],
        }

        response = self.client.get("/token-usage")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            {
                "total_tokens": 120,
                "total_cost_usd": 0.000435,
                "plan": "free",
                "available_token": 99880,
                "max_allowed_token": 100000,
                "days": [{"date": "2026-07-24", "tokens": 40}],
            },
        )


if __name__ == "__main__":
    unittest.main()
