import bootstrap  # noqa: F401
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import MagicMock, patch
import zipfile
import io

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
        self.export_patcher = patch("backend.routes.export_database.get_export_database_content")
        self.mock_export = self.export_patcher.start()
        self.addCleanup(self.export_patcher.stop)
        self.mock_export.reset_mock()
    
    def test_export_database_returns_file_with_flask_send_file(self):
        # Arrange
        self.mock_export.return_value = "Hello world!"

        # Act
        response = self.client.post("/database/export")

        # Assert HTTP response
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.mimetype, "application/zip")

        self.assertIn(
            "attachment; filename=teacher-wang-export.zip",
            response.headers["Content-Disposition"],
        )

        # Assert ZIP contents
        with zipfile.ZipFile(io.BytesIO(response.data)) as zip_file:
            self.assertEqual(
                zip_file.namelist(),
                ["teacher-wang-export.txt"],
            )

            exported_content = zip_file.read(
                "teacher-wang-export.txt"
            ).decode("utf-8")

        self.assertEqual(exported_content, "Hello world!")


if __name__ == "__main__":
    unittest.main()
