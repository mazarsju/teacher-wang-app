import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock, patch

import backend.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.app import app  # noqa: E402
from auth_stub import authenticated_client, patch_request_auth  # noqa: E402
from backend.llm import LLM_API_KEY_ENV, LLM_MODEL_ENV  # noqa: E402


class TestLlmConfigEndpoint(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)
        self.read_patcher = patch("backend.routes.llm_config.read_llm_config")
        self.write_patcher = patch("backend.routes.llm_config.write_llm_config")
        self.reset_patcher = patch("backend.routes.llm_config.reset_llm_cache")
        self.mock_read = self.read_patcher.start()
        self.mock_write = self.write_patcher.start()
        self.mock_reset = self.reset_patcher.start()
        self.addCleanup(self.read_patcher.stop)
        self.addCleanup(self.write_patcher.stop)
        self.addCleanup(self.reset_patcher.stop)
        self.mock_read.reset_mock()
        self.mock_write.reset_mock()
        self.mock_reset.reset_mock()

    def test_get_llm_config_returns_current_values(self):
        self.mock_read.return_value = {
            LLM_API_KEY_ENV: "secret-key",
            LLM_MODEL_ENV: "gpt-4o-mini",
        }

        response = self.client.get("/llm-config")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            {
                LLM_API_KEY_ENV: "secret-key",
                LLM_MODEL_ENV: "gpt-4o-mini",
            },
        )
        self.mock_read.assert_called_once()

    def test_post_llm_config_writes_values_and_resets_cache(self):
        self.mock_write.return_value = {
            LLM_API_KEY_ENV: "new-key",
            LLM_MODEL_ENV: "gpt-4o",
        }

        response = self.client.post(
            "/llm-config",
            json={
                LLM_API_KEY_ENV: "new-key",
                LLM_MODEL_ENV: "gpt-4o",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.mock_write.assert_called_once_with(
            api_key="new-key",
            model="gpt-4o",
        )
        self.mock_reset.assert_called_once()
        self.assertEqual(
            response.get_json(),
            {
                LLM_API_KEY_ENV: "new-key",
                LLM_MODEL_ENV: "gpt-4o",
            },
        )

    def test_post_llm_config_rejects_invalid_json(self):
        response = self.client.post(
            "/llm-config",
            data="not-json",
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.mock_write.assert_not_called()
        self.mock_reset.assert_not_called()


if __name__ == "__main__":
    unittest.main()
