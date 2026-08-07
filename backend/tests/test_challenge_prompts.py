"""Tests for DRY challenge system prompt builder."""

import unittest

from backend.challenge_prompts import (
    CHALLENGE_SCENARIOS,
    build_challenge_system_prompt,
)
from backend.chat_agents import CHAT_CHARACTERS, get_character


SHARED_PHRASES = (
    "Can speak and understand only Chinese",
    "Do not keep asking follow-up questions",
    "double square brackets",
    "never single brackets",
    "[[<Next action most likely to happen>]]",
)

SCENARIO_GATES = {
    "challenge-restaurant": "[[The waiter needs to be called to come]]",
    "challenge-taxi": "[[The taxi needs to be hailed]]",
    "challenge-hotel": "[[The receptionist needs to be greeted]]",
    "challenge-shop": "[[The shop assistant needs to be greeted]]",
    "challenge-new-friend": "[[Xiao Ming needs to be greeted first]]",
}


class ChallengePromptsTest(unittest.TestCase):
    def test_all_scenarios_are_registered(self):
        self.assertEqual(set(CHALLENGE_SCENARIOS), set(SCENARIO_GATES))

    def test_shared_rules_present_in_each_built_prompt(self):
        for character_id, scenario in CHALLENGE_SCENARIOS.items():
            with self.subTest(character_id=character_id):
                prompt = build_challenge_system_prompt(scenario)
                for phrase in SHARED_PHRASES:
                    self.assertIn(phrase, prompt)
                # Shared leave-form instructions appear once (not duplicated).
                self.assertEqual(
                    prompt.count("[[<Next action most likely to happen>]]"),
                    1,
                )
                self.assertIn("## Role", prompt)
                self.assertIn("## Style", prompt)
                self.assertIn("## Initial situation", prompt)
                self.assertIn("## First contact", prompt)
                self.assertIn("## Progression", prompt)
                self.assertIn("## Stage directions", prompt)

    def test_scenario_specific_gate_brackets(self):
        for character_id, gate in SCENARIO_GATES.items():
            with self.subTest(character_id=character_id):
                prompt = build_challenge_system_prompt(
                    CHALLENGE_SCENARIOS[character_id]
                )
                self.assertIn(gate, prompt)

    def test_chat_agents_use_builder_output(self):
        for character_id, scenario in CHALLENGE_SCENARIOS.items():
            with self.subTest(character_id=character_id):
                character = get_character(character_id)
                expected = build_challenge_system_prompt(scenario)
                self.assertEqual(character["system_prompt"], expected)
                self.assertTrue(character["retry_unknown_characters"])

    def test_non_challenge_agents_unchanged(self):
        self.assertIn("Teacher Wang", CHAT_CHARACTERS["teacher-wang"]["system_prompt"])
        self.assertIn("Xiao Ming", CHAT_CHARACTERS["xiao-ming"]["system_prompt"])
        self.assertNotIn("## Stage directions", CHAT_CHARACTERS["teacher-wang"]["system_prompt"])


if __name__ == "__main__":
    unittest.main()
