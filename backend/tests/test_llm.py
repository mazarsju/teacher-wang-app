import bootstrap  # noqa: F401
import os
import unittest
from unittest.mock import MagicMock, patch

import backend.utils.database.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.utils.aiChat.llm import LLM_API_KEY_ENV, LLM_MODEL_ENV, get_llm  # noqa: E402


class TestGetLlm(unittest.TestCase):
    def setUp(self):
        get_llm.cache_clear()
        self.read_config_patcher = patch("backend.utils.aiChat.llm_config.read_llm_config")
        self.mock_read_config = self.read_config_patcher.start()
        self.addCleanup(self.read_config_patcher.stop)
        self.mock_read_config.reset_mock()
        self.mock_read_config.return_value = {
            LLM_API_KEY_ENV: "",
            LLM_MODEL_ENV: "",
        }

    def tearDown(self):
        get_llm.cache_clear()

    @patch("backend.utils.aiChat.llm.ChatOpenAI")
    def test_get_llm_reads_values_from_config(self, mock_chat_openai):
        mock_instance = MagicMock()
        mock_chat_openai.return_value = mock_instance
        self.mock_read_config.return_value = {
            LLM_API_KEY_ENV: "test-key",
            LLM_MODEL_ENV: "gpt-4o-mini",
        }

        result = get_llm()

        self.assertIs(result, mock_instance)
        mock_chat_openai.assert_called_once_with(
            api_key="test-key",
            model="gpt-4o-mini",
        )

    def test_get_llm_raises_when_api_key_missing(self):
        with self.assertRaises(ValueError):
            get_llm()

    def test_get_llm_raises_when_model_missing(self):
        self.mock_read_config.return_value = {
            LLM_API_KEY_ENV: "test-key",
            LLM_MODEL_ENV: "",
        }

        with self.assertRaises(ValueError):
            get_llm()


if __name__ == "__main__":
    unittest.main()
