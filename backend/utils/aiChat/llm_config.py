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
    key = key.strip()
    if key not in {LLM_API_KEY_ENV, LLM_MODEL_ENV}:
        return None

    return key, value.strip()


def read_llm_config() -> dict[str, str]:
    """Resolve operator LLM settings for backend use only.

    Precedence: non-empty ``.config.txt`` values (local/dev convenience), then
    ``LLM_API_KEY`` / ``LLM_MODEL`` environment variables (ECS / Secrets Manager).

    These values must never be exposed through the API or UI.
    """
    config = {
        LLM_API_KEY_ENV: "",
        LLM_MODEL_ENV: "",
    }

    if CONFIG_PATH.is_file():
        for line in CONFIG_PATH.read_text(encoding="utf-8").splitlines():
            parsed = _parse_config_line(line)
            if parsed is not None:
                key, value = parsed
                config[key] = value

    for key in (LLM_API_KEY_ENV, LLM_MODEL_ENV):
        if not config[key].strip():
            config[key] = os.environ.get(key, "").strip()

    return config
