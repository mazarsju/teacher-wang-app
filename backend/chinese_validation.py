import re

HAN_CHARACTER_PATTERN = re.compile(
    r"^["
    r"\u3400-\u4dbf"
    r"\u4e00-\u9fff"
    r"\uf900-\ufaff"
    r"]$"
)


def is_han_character(char: str) -> bool:
    return len(char) == 1 and bool(HAN_CHARACTER_PATTERN.fullmatch(char))


def extract_han_characters(text: str) -> set[str]:
    return {char for char in text if is_han_character(char)}
