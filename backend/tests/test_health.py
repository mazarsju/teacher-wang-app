import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock, patch

import backend.utils.database.database as database_module
from sqlalchemy.exc import OperationalError

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.app import app  # noqa: E402


class TestHealthEndpoint(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_health_ok_when_database_responds(self):
        with patch("backend.routes.health.db.session.execute") as execute:
            execute.return_value = MagicMock()
            response = self.client.get("/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            {"status": "ok", "service": "backend", "database": "up"},
        )
        execute.assert_called_once()

    def test_health_unhealthy_when_database_fails(self):
        with patch("backend.routes.health.db.session.execute") as execute:
            execute.side_effect = OperationalError("SELECT 1", {}, Exception("down"))
            response = self.client.get("/health")

        self.assertEqual(response.status_code, 503)
        self.assertEqual(
            response.get_json(),
            {"status": "unhealthy", "service": "backend", "database": "down"},
        )


if __name__ == "__main__":
    unittest.main()
