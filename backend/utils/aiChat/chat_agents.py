from backend.utils.aiChat.challenge_prompts import (
    CHALLENGE_SCENARIOS,
    build_challenge_system_prompt,
)

CHAT_CHARACTERS = {
    "teacher-wang": {
        "name": "Teacher Wang",
        "chinese_name": "王老师",
        "retry_unknown_characters": False,
        "system_prompt": (
            "You are Teacher Wang (王老师), a native Chinese teacher who "
            "also speaks English. You help the learner practice Mandarin."
        ),
    },
    "xiao-ming": {
        "name": "Xiao Ming",
        "chinese_name": "小明",
        "retry_unknown_characters": True,
        "system_prompt": (
            "You are Xiao Ming (小明), the learner's native Chinese friend. "
            "Chat casually in Mandarin about everyday life, hobbies, food, and "
            "culture. Keep a friendly tone and use simple, natural Chinese. "
            "His answers are short, usually between 1 and 3 sentences."
        ),
    },
    "challenge-restaurant": {
        "name": "Waiter",
        "chinese_name": "服务员",
        "retry_unknown_characters": True,
        "system_prompt": build_challenge_system_prompt(
            CHALLENGE_SCENARIOS["challenge-restaurant"]
        ),
    },
    "challenge-taxi": {
        "name": "Taxi Driver",
        "chinese_name": "出租车司机",
        "retry_unknown_characters": True,
        "system_prompt": build_challenge_system_prompt(
            CHALLENGE_SCENARIOS["challenge-taxi"]
        ),
    },
    "challenge-hotel": {
        "name": "Hotel Receptionist",
        "chinese_name": "前台",
        "retry_unknown_characters": True,
        "system_prompt": build_challenge_system_prompt(
            CHALLENGE_SCENARIOS["challenge-hotel"]
        ),
    },
    "challenge-shop": {
        "name": "Shop Assistant",
        "chinese_name": "售货员",
        "retry_unknown_characters": True,
        "system_prompt": build_challenge_system_prompt(
            CHALLENGE_SCENARIOS["challenge-shop"]
        ),
    },
    "challenge-new-friend": {
        "name": "Xiao Ming",
        "chinese_name": "小明",
        "retry_unknown_characters": True,
        "system_prompt": build_challenge_system_prompt(
            CHALLENGE_SCENARIOS["challenge-new-friend"]
        ),
    },
    "challenge-directions": {
        "name": "Passerby",
        "chinese_name": "路人",
        "retry_unknown_characters": True,
        "system_prompt": build_challenge_system_prompt(
            CHALLENGE_SCENARIOS["challenge-directions"]
        ),
    },
    "challenge-train-station": {
        "name": "Ticket Seller",
        "chinese_name": "售票员",
        "retry_unknown_characters": True,
        "system_prompt": build_challenge_system_prompt(
            CHALLENGE_SCENARIOS["challenge-train-station"]
        ),
    },
    "challenge-doctor": {
        "name": "Doctor",
        "chinese_name": "医生",
        "retry_unknown_characters": True,
        "system_prompt": build_challenge_system_prompt(
            CHALLENGE_SCENARIOS["challenge-doctor"]
        ),
    },
    "challenge-job-interview": {
        "name": "Interviewer",
        "chinese_name": "面试官",
        "retry_unknown_characters": True,
        "system_prompt": build_challenge_system_prompt(
            CHALLENGE_SCENARIOS["challenge-job-interview"]
        ),
    },
    "challenge-library": {
        "name": "Librarian",
        "chinese_name": "图书管理员",
        "retry_unknown_characters": True,
        "system_prompt": build_challenge_system_prompt(
            CHALLENGE_SCENARIOS["challenge-library"]
        ),
    },
    "challenge-bus": {
        "name": "Bus Driver",
        "chinese_name": "公交车司机",
        "retry_unknown_characters": True,
        "system_prompt": build_challenge_system_prompt(
            CHALLENGE_SCENARIOS["challenge-bus"]
        ),
    },
    "challenge-hair-salon": {
        "name": "Hairdresser",
        "chinese_name": "理发师",
        "retry_unknown_characters": True,
        "system_prompt": build_challenge_system_prompt(
            CHALLENGE_SCENARIOS["challenge-hair-salon"]
        ),
    },
    "challenge-apartment": {
        "name": "Landlord",
        "chinese_name": "房东",
        "retry_unknown_characters": True,
        "system_prompt": build_challenge_system_prompt(
            CHALLENGE_SCENARIOS["challenge-apartment"]
        ),
    },
}


def get_character(character_id: str) -> dict:
    character = CHAT_CHARACTERS.get(character_id)
    if character is None:
        raise ValueError(f"Unknown character id: {character_id}")
    return character


def get_system_prompt(
    user_id: str, character_id: str, language_code: str | None = None
) -> str:
    from backend.utils.knowledgeBase.hsk_level import get_chat_speaking_hsk_level

    character = get_character(character_id)
    speaking_level = get_chat_speaking_hsk_level(user_id)
    scenario = CHALLENGE_SCENARIOS.get(character_id)
    system_prompt = (
        build_challenge_system_prompt(scenario, language_code)
        if scenario is not None
        else character["system_prompt"]
    )
    return (
        f"{system_prompt} The Chinese you use should be "
        f"understandable by an HSK {speaking_level} level student."
    )
