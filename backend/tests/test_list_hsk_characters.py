import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock, patch

import backend.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.app import app  # noqa: E402
from auth_stub import authenticated_client, patch_request_auth  # noqa: E402


class TestListHskCharactersEndpoint(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)
        self.hsk_patcher = patch("backend.routes.list_hsk_characters.HskCharacter")
        self.mock_hsk_cls = self.hsk_patcher.start()
        self.addCleanup(self.hsk_patcher.stop)
        self.mock_hsk_cls.reset_mock()

    def test_list_hsk_characters_returns_all_records(self):
        first = MagicMock(character="爱", level=1, frequency=10)
        second = MagicMock(character="学", level=2, frequency=50)
        self.mock_hsk_cls.query.order_by.return_value.all.return_value = [
            first,
            second,
        ]

        response = self.client.get("/hsk-characters")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            [
                {"character": "爱", "level": 1, "frequency": 10},
                {"character": "学", "level": 2, "frequency": 50},
            ],
        )
        self.mock_hsk_cls.query.order_by.assert_called_once()


if __name__ == "__main__":
    unittest.main()
