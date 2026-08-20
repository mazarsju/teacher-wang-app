import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock, patch

import backend.utils.database.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.app import app  # noqa: E402


class TestRequestLogging(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_health_sets_generated_request_id_header(self):
        with patch("backend.routes.health.db.session.execute") as execute:
            execute.return_value = MagicMock()
            response = self.client.get("/health")

        self.assertEqual(response.status_code, 200)
        request_id = response.headers.get("X-Request-Id")
        self.assertIsNotNone(request_id)
        self.assertEqual(len(request_id), 32)

    def test_health_echoes_inbound_request_id(self):
        with patch("backend.routes.health.db.session.execute") as execute:
            execute.return_value = MagicMock()
            response = self.client.get(
                "/health",
                headers={"X-Request-Id": "abc123trace"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get("X-Request-Id"), "abc123trace")


if __name__ == "__main__":
    unittest.main()
