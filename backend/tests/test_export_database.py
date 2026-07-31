import bootstrap  # noqa: F401
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import MagicMock, patch

import backend.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

sys.modules.pop("backend.app", None)

from backend.app import app  # noqa: E402
from auth_stub import (  # noqa: E402
    TEST_USER_ID,
    authenticated_client,
    patch_request_auth,
)


class TestExportDatabaseEndpoint(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)
        self.export_patcher = patch("backend.routes.export_database.export_database_to_file")
        self.mock_export = self.export_patcher.start()
        self.addCleanup(self.export_patcher.stop)
        self.mock_export.reset_mock()

    def test_export_database_writes_file_and_returns_success(self):
        with TemporaryDirectory() as temp_dir:
            export_path = Path(temp_dir) / "db.txt"
            self.mock_export.return_value = export_path

            response = self.client.post("/database/export")

            self.assertEqual(response.status_code, 200)
            self.assertEqual(
                response.get_json(),
                {
                    "message": "Database exported to db.txt",
                    "filename": "db.txt",
                },
            )
            self.mock_export.assert_called_once_with(TEST_USER_ID)


if __name__ == "__main__":
    unittest.main()
