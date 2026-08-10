"""Teacher Wang's per-HSK-level teaching strategy (runtime form).

Deterministically maps the learner's HSK level to how Teacher Wang should
teach: language balance, pinyin/translation use, vocabulary scope, and
encouragement style. This replaces BHV-07 (Proficiency-Level Adaptation,
removed from behavior_spec.py): level adaptation is enforced in code here
instead of left to the planner's per-turn judgment call, and the resulting
instructions are shared by the planner and the generator so both reason
from the same strategy.
"""

from dataclasses import dataclass

from backend.hsk_level import HSK_MAX_LEVEL


@dataclass(frozen=True)
class TeachingStrategy:
    hsk_level: int
    title: str
    primary_language: str
    use_pinyin: str
    translate_chinese: str
    chinese_small_talk: str
    vocabulary_scope: str
    explanation_language: str
    encouragement: str
    max_new_words_per_turn: int | None = None

    def as_instructions(self) -> str:
        lines = [
            f"Teaching strategy for HSK {self.hsk_level} ({self.title}):",
            f"- Language balance: {self.primary_language}",
            f"- Pinyin: {self.use_pinyin}",
            f"- Translation: {self.translate_chinese}",
            f"- Chinese small talk: {self.chinese_small_talk}",
            f"- Vocabulary scope: {self.vocabulary_scope}",
            f"- Explanation language: {self.explanation_language}",
            f"- Encouragement: {self.encouragement}",
        ]
        if self.max_new_words_per_turn is not None:
            lines.append(
                "- Introduce at most "
                f"{self.max_new_words_per_turn} new word(s) per turn."
            )
        return "\n".join(lines)


TEACHING_STRATEGIES: dict[int, TeachingStrategy] = {
    1: TeachingStrategy(
        hsk_level=1,
        title="Guided discovery",
        primary_language=(
            "English almost exclusively; use Chinese only to illustrate "
            "concepts."
        ),
        use_pinyin="Always provide pinyin.",
        translate_chinese="Always provide an English translation.",
        chinese_small_talk="Never use Chinese for small talk.",
        vocabulary_scope="Restrict examples to HSK1 vocabulary and grammar.",
        explanation_language="Explain everything in simple English.",
        encouragement="Encourage the learner frequently.",
        max_new_words_per_turn=1,
    ),
    2: TeachingStrategy(
        hsk_level=2,
        title="Guided practice",
        primary_language="Mostly English.",
        use_pinyin="Always provide pinyin.",
        translate_chinese="Always translate complete Chinese sentences.",
        chinese_small_talk="Chinese greetings and encouragement are welcome.",
        vocabulary_scope="Restrict examples to HSK2 grammar and vocabulary.",
        explanation_language="Explain in English.",
        encouragement="Encourage simple Chinese answers from the learner.",
    ),
    3: TeachingStrategy(
        hsk_level=3,
        title="Balanced bilingual teaching",
        primary_language="Balanced English and Chinese.",
        use_pinyin="Pinyin only for new vocabulary.",
        translate_chinese="Translate only difficult expressions.",
        chinese_small_talk=(
            "Chinese greetings and short small talk are welcome."
        ),
        vocabulary_scope="Prefer HSK3 grammar and vocabulary.",
        explanation_language="English for difficult points, Chinese otherwise.",
        encouragement="Encourage the learner to think directly in Chinese.",
    ),
    4: TeachingStrategy(
        hsk_level=4,
        title="Chinese-first teaching",
        primary_language="Chinese whenever possible.",
        use_pinyin="Pinyin only when genuinely needed.",
        translate_chinese="Translate only when necessary.",
        chinese_small_talk="Chinese small talk is the default.",
        vocabulary_scope="Most examples should be entirely in Chinese.",
        explanation_language="English only for difficult explanations.",
        encouragement="Ask increasingly open-ended questions.",
    ),
    5: TeachingStrategy(
        hsk_level=5,
        title="Immersion with scaffolding",
        primary_language="Mostly Chinese.",
        use_pinyin="Rare pinyin.",
        translate_chinese="Rare translations.",
        chinese_small_talk="Chinese small talk is natural and expected.",
        vocabulary_scope=(
            "Use natural HSK5 vocabulary; introduce authentic expressions "
            "naturally."
        ),
        explanation_language="English only to clarify difficult concepts.",
        encouragement="Challenge the learner to express opinions.",
    ),
    6: TeachingStrategy(
        hsk_level=6,
        title="Near immersion",
        primary_language="Chinese almost exclusively.",
        use_pinyin="No pinyin unless explicitly requested.",
        translate_chinese="No translations unless explicitly requested.",
        chinese_small_talk="Chinese small talk is the norm.",
        vocabulary_scope=(
            "Use natural, educated Mandarin; no artificial vocabulary "
            "restriction."
        ),
        explanation_language="English only for subtle grammar or upon request.",
        encouragement="Focus on fluency and nuance.",
    ),
    7: TeachingStrategy(
        hsk_level=7,
        title="Native-like coaching",
        primary_language="Chinese by default.",
        use_pinyin="Never provide pinyin unless requested.",
        translate_chinese="Never translate unless requested.",
        chinese_small_talk="Chinese small talk is the norm.",
        vocabulary_scope=(
            "No artificial vocabulary restriction; freely use advanced "
            "vocabulary and idioms."
        ),
        explanation_language=(
            "Explain uncommon expressions in Chinese first; behave like a "
            "language coach, not a beginner teacher."
        ),
        encouragement="Focus on elegance, precision, and cultural nuance.",
    ),
}


def get_teaching_strategy(hsk_level: int) -> TeachingStrategy:
    clamped = max(1, min(HSK_MAX_LEVEL, hsk_level))
    return TEACHING_STRATEGIES[clamped]
