import { describe, expect, it } from "vitest";
import {
  buildVocabularyCardTemplates,
  normalizeOptionalFields,
} from "./ankiVocabularySetup";

describe("normalizeOptionalFields", () => {
  it("trims, drops empties, and rejects duplicates/conflicts", () => {
    expect(normalizeOptionalFields([" Extra ", "", "Note"])).toEqual([
      "Extra",
      "Note",
    ]);
    expect(() => normalizeOptionalFields(["pinyin"])).toThrow(/mandatory/);
    expect(() => normalizeOptionalFields(["A", "a"])).toThrow(/Duplicate/);
  });

  it("returns empty array for undefined", () => {
    expect(normalizeOptionalFields()).toEqual([]);
  });
});

describe("buildVocabularyCardTemplates", () => {
  it("builds three card directions", () => {
    const templates = buildVocabularyCardTemplates(["Audio"]);
    expect(templates).toHaveLength(3);
    expect(templates[0]?.Name).toContain("Writting");
    expect(templates[0]?.Back).toContain("{{Audio}}");
  });
});
