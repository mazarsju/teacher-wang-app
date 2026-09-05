"""Tests for DRY challenge system prompt builder."""

import unittest

from backend.utils.aiChat.challenge_prompts import (
    CHALLENGE_SCENARIOS,
    RESTAURANT,
    build_challenge_system_prompt,
)
from backend.utils.aiChat.chat_agents import CHAT_CHARACTERS, get_character


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
    "challenge-directions": "[[The passerby needs to be greeted or asked for help]]",
    "challenge-train-station": "[[The ticket seller needs to be greeted]]",
    "challenge-doctor": "[[The doctor needs to be greeted]]",
    "challenge-job-interview": "[[The interviewer needs to be greeted]]",
    "challenge-library": "[[The librarian needs to be greeted]]",
    "challenge-bus": "[[The bus driver needs to be asked about the route]]",
    "challenge-hair-salon": "[[The hairdresser needs to be greeted]]",
    "challenge-apartment": "[[The landlord needs to be greeted]]",
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

    def test_leave_example_languages_match_across_scenarios(self):
        # Every scenario must offer the same set of languages, so a new
        # language added to one scenario and forgotten in another is caught
        # here instead of silently falling back to English at runtime.
        language_sets = {
            character_id: frozenset(scenario.leave_example)
            for character_id, scenario in CHALLENGE_SCENARIOS.items()
        }
        expected = frozenset(RESTAURANT.leave_example)
        self.assertIn("en", expected)
        for character_id, languages in language_sets.items():
            with self.subTest(character_id=character_id):
                self.assertEqual(languages, expected)

    def test_leave_example_translates_by_language(self):
        # Loops over every language actually present, so a newly added
        # language is exercised automatically without editing this test.
        for character_id, scenario in CHALLENGE_SCENARIOS.items():
            prompts_by_language = {
                language: build_challenge_system_prompt(scenario, language)
                for language in scenario.leave_example
            }
            for language, prompt in prompts_by_language.items():
                with self.subTest(character_id=character_id, language=language):
                    self.assertIn(scenario.leave_example[language], prompt)
            # Distinct languages must produce distinct example lines.
            with self.subTest(character_id=character_id):
                self.assertEqual(
                    len(set(prompts_by_language.values())),
                    len(prompts_by_language),
                )

    def test_leave_example_defaults_to_english(self):
        for character_id, scenario in CHALLENGE_SCENARIOS.items():
            with self.subTest(character_id=character_id):
                default_prompt = build_challenge_system_prompt(scenario)
                unknown_language_prompt = build_challenge_system_prompt(scenario, "zz")
                self.assertIn(scenario.leave_example["en"], default_prompt)
                self.assertIn(scenario.leave_example["en"], unknown_language_prompt)


if __name__ == "__main__":
    unittest.main()
