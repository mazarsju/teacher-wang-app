import bootstrap  # noqa: F401
import unittest

from backend.utils.aiChat.behavior_spec import (
    BEHAVIOR_IDS,
    get_behavior,
    get_behaviors,
    language_name,
)


class TestLanguageName(unittest.TestCase):
    def test_known_code_resolves_to_display_name(self):
        self.assertEqual(language_name("fr"), "French")

    def test_defaults_to_english_when_code_is_none(self):
        self.assertEqual(language_name(None), "English")

    def test_falls_back_to_english_for_unrecognized_code(self):
        self.assertEqual(language_name("xx"), "English")


class TestGetBehaviors(unittest.TestCase):
    def test_renders_meta_language_mentions_in_requested_language(self):
        behaviors = {behavior["id"]: behavior for behavior in get_behaviors("fr")}

        self.assertIn(
            "French", behaviors["BHV-02"]["objective"]
        )
        self.assertNotIn("English", behaviors["BHV-02"]["objective"])
        self.assertIn("French", behaviors["BHV-05"]["requirements"])
        self.assertIn("French", behaviors["BHV-06"]["requirements"])
        self.assertIn("French", behaviors["BHV-10"]["requirements"])

    def test_defaults_to_english_when_no_language_code_given(self):
        behaviors = {behavior["id"]: behavior for behavior in get_behaviors()}

        self.assertIn("English", behaviors["BHV-02"]["objective"])

    def test_returns_every_behavior_id_unchanged(self):
        ids = {behavior["id"] for behavior in get_behaviors("fr")}
        self.assertEqual(ids, BEHAVIOR_IDS)

    def test_fields_without_a_language_placeholder_are_untouched(self):
        behaviors = {behavior["id"]: behavior for behavior in get_behaviors("fr")}
        self.assertEqual(behaviors["BHV-01"]["title"], "Direct Question Answering")


class TestGetBehavior(unittest.TestCase):
    def test_renders_single_behavior_in_requested_language(self):
        behavior = get_behavior("BHV-02", "fr")
        self.assertIn("French", behavior["requirements"])

    def test_defaults_to_english(self):
        behavior = get_behavior("BHV-02")
        self.assertIn("English", behavior["requirements"])

    def test_unaffected_behavior_is_identical_regardless_of_language(self):
        self.assertEqual(
            get_behavior("BHV-01", "fr"), get_behavior("BHV-01", "en")
        )


if __name__ == "__main__":
    unittest.main()
