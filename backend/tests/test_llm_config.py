import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.llm import LLM_API_KEY_ENV, LLM_MODEL_ENV  # noqa: E402
from backend.llm_config import read_llm_config  # noqa: E402


class TestLlmConfigFile(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.config_path = Path(self.temp_dir.name) / ".config.txt"
        self.path_patcher = patch(
            "backend.llm_config.CONFIG_PATH",
            self.config_path,
        )
        self.path_patcher.start()

    def tearDown(self):
        self.path_patcher.stop()
        self.temp_dir.cleanup()

    def test_read_llm_config_returns_empty_values_when_file_missing(self):
        self.assertEqual(
            read_llm_config(),
            {
                LLM_API_KEY_ENV: "",
                LLM_MODEL_ENV: "",
            },
        )

    def test_read_llm_config_parses_file(self):
        self.config_path.write_text(
            "LLM_API_KEY=secret-key\nLLM_MODEL=gpt-4o-mini\n",
            encoding="utf-8",
        )

        self.assertEqual(
            read_llm_config(),
            {
                LLM_API_KEY_ENV: "secret-key",
                LLM_MODEL_ENV: "gpt-4o-mini",
            },
        )


if __name__ == "__main__":
    unittest.main()
