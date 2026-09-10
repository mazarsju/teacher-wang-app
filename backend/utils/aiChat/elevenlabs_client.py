"""ElevenLabs text-to-speech client (used for the "realistic voice" pro feature)."""

import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from backend.utils.aiChat.llm_config import read_config_value

ELEVENLABS_API_KEY_ENV = "ELEVENLABS_API_KEY"
ELEVENLABS_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
ELEVENLABS_MODEL_ID = "eleven_multilingual_v2"

# ElevenLabs' voice library mostly requires a paid plan for API access
# (confirmed: many default/premade voices — e.g. "Aria", "Charlotte", the
# classic "Rachel"/"Domi"/"Elli"/"Josh"/"Sam" — return 402 paid_plan_required
# on a free-tier key). These are every default voice confirmed, by a real
# API call, to work on the free plan — one entry per character is picked
# from the matching-gender pool in chatCharacters.ts/challenges.ts.
ELEVENLABS_VOICE_IDS = {
    # Female
    "sarah": "EXAVITQu4vr4xnSDxMaL",
    "laura": "FGY2WhTYpPnrIDTdsKH5",
    "alice": "Xb7hH8MSUJpSbSDYk0k2",
    "matilda": "XrExE9yKIg1WjnnlVkGX",
    "jessica": "cgSgspJ2msm6clMCkdW9",
    "lily": "pFZP5JQG7iQjIQuC4Bku",
    # Male
    "roger": "CwhRBWXzGAHq8TQ4Fs17",
    "charlie": "IKne3meq5aSn9XLyUdCD",
    "george": "JBFqnCBsd6RMkjVDRZzb",
    "callum": "N2lVS1w4EtoT3dr4eOWO",
    "liam": "TX3LPaxmHKxFdv7VOQHJ",
    "will": "bIHbv24MWmeRgasZH58o",
    "eric": "cjVigY5qzO86Huf0OWal",
    "chris": "iP95p4xoKVk53GoZ742B",
    "brian": "nPczCjzI2devNBz1zQrb",
    "daniel": "onwK4e9ZLuTAKqWW03F9",
    "antoni": "ErXwobaYiN019PkySvjV",
    "arnold": "VR6AewLTigWG4xSOukaG",
    "adam": "pNInz6obpgDQGcFmaJgB",
}

# ElevenLabs only accepts voice_settings.speed within this range.
MIN_SPEED = 0.7
MAX_SPEED = 1.2


def _require_api_key() -> str:
    api_key = read_config_value(ELEVENLABS_API_KEY_ENV)
    if not api_key:
        raise ValueError(
            f"{ELEVENLABS_API_KEY_ENV} must be set as an environment variable "
            "(or in .config.txt for local development)"
        )
    return api_key


def generate_speech(voice_name: str, text: str, speed: float) -> bytes:
    voice_id = ELEVENLABS_VOICE_IDS.get(voice_name)
    if voice_id is None:
        raise ValueError(f"Unknown ElevenLabs voice: {voice_name}")

    api_key = _require_api_key()
    clamped_speed = max(MIN_SPEED, min(MAX_SPEED, speed))
    body = json.dumps(
        {
            "text": text,
            "model_id": ELEVENLABS_MODEL_ID,
            "voice_settings": {"speed": clamped_speed},
        }
    ).encode("utf-8")

    request = Request(
        ELEVENLABS_TTS_URL.format(voice_id=voice_id),
        data=body,
        headers={
            "xi-api-key": api_key,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=30) as response:  # noqa: S310 - fixed https API host
            return response.read()
    except (HTTPError, URLError) as error:
        raise ValueError(f"ElevenLabs request failed: {error}") from error
