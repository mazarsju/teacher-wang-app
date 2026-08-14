import os
from pathlib import Path

from backend.utils.aiChat.llm import LLM_API_KEY_ENV, LLM_MODEL_ENV

CONFIG_FILENAME = ".config.txt"
CONFIG_PATH = Path(
    os.environ.get(
        "LLM_CONFIG_PATH",
        Path(__file__).resolve().parents[3] / CONFIG_FILENAME,
    )
)


def _parse_config_line(line: str) -> tuple[str, str] | None:
    stripped = line.strip()
    if not stripped or stripped.startswith("#"):
        return None

    key, _, value = stripped.partition("=")
    return key.strip(), value.strip()


def read_config_value(name: str) -> str:
    """Resolve a single operator config value for backend use only.

    Precedence: a non-empty ``.config.txt`` value (local/dev convenience),
    then the ``name`` environment variable (ECS / Secrets Manager).

    This value must never be exposed through the API or UI.
    """
    if CONFIG_PATH.is_file():
        for line in CONFIG_PATH.read_text(encoding="utf-8").splitlines():
            parsed = _parse_config_line(line)
            if parsed is not None and parsed[0] == name and parsed[1]:
                return parsed[1]

    return os.environ.get(name, "").strip()


def read_llm_config() -> dict[str, str]:
    """Resolve operator LLM settings for backend use only.

    Precedence: non-empty ``.config.txt`` values (local/dev convenience), then
    ``LLM_API_KEY`` / ``LLM_MODEL`` environment variables (ECS / Secrets Manager).

    These values must never be exposed through the API or UI.
    """
    return {
        LLM_API_KEY_ENV: read_config_value(LLM_API_KEY_ENV),
        LLM_MODEL_ENV: read_config_value(LLM_MODEL_ENV),
    }
