# Teacher Wang — Teaching Strategy

## Purpose

The Teaching Strategy adapts Teacher Wang's teaching *style* — language balance, pinyin, translation, vocabulary scope, and encouragement — to the learner's HSK level. It is deterministic: given an HSK level, the strategy is fully determined, with no planner or model call involved in selecting it.

This is separate from [teacher-wang-behaviors.md](teacher-wang-behaviors.md), which covers *what teaching moves* apply to a given turn (answering a question, correcting an error, teaching vocabulary, …). The strategy governs *how* those moves are carried out at the learner's level. Proficiency-level adaptation used to be a behavior (BHV-07) selected by the planner; it was removed because level adaptation should never depend on the planner's per-turn judgment — it is a property of the learner, known in advance, not of the message.

## Runtime source of truth

`backend/utils/aiChat/teaching_strategy.py` defines one `TeachingStrategy` per HSK level (1–7) and `get_teaching_strategy(hsk_level)` to look one up (clamping out of range levels to 1 or 7). The same rendered strategy text is given to both the behavior planner (as context for which behaviors it selects) and the response generator (as concrete instructions), so both reason from one shared, stable representation instead of two independently drifting prompts.

Unlike the planner/generator/validator pipeline in [teacher-wang-behaviors.md](teacher-wang-behaviors.md), the Teaching Strategy adds no extra LLM call — it is plain text assembled in code. It is therefore **not** part of the learner's Smart AI toggle: it applies every Teacher Wang turn regardless of whether Smart AI is on or off. When Smart AI is off, the planner never runs, so the strategy text only reaches the generator, not a planner — see [adr/ai-agents.md](../adr/ai-agents.md).

## Levels

| Level | Title | Language balance |
| --- | --- | --- |
| HSK1 | Guided discovery | English almost exclusively; Chinese only to illustrate concepts |
| HSK2 | Guided practice | Mostly English |
| HSK3 | Balanced bilingual teaching | Balanced English and Chinese |
| HSK4 | Chinese-first teaching | Chinese whenever possible |
| HSK5 | Immersion with scaffolding | Mostly Chinese |
| HSK6 | Near immersion | Chinese almost exclusively |
| HSK7 | Native-like coaching | Chinese by default |

Each level fixes: language balance, pinyin usage, translation usage, Chinese small talk, vocabulary scope, explanation language, and encouragement style. HSK1 additionally caps new vocabulary at one word per turn. See `backend/utils/aiChat/teaching_strategy.py` for the exact wording used at each level.

## Non-goals

- No prompt wording beyond what's needed to describe each level's intent — the exact instruction text lives in code, this is the rationale and catalog.
- No behavior-selection logic (that's the planner, driven by `teacher-wang-behaviors.md`).
