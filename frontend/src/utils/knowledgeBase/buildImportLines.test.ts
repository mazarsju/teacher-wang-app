import { describe, expect, it } from "vitest";
import { extractCharacterEntries } from "./buildImportLines";

describe("extractCharacterEntries", () => {
  it("splits each character with its aligned pinyin syllable", () => {
    const entries = extractCharacterEntries([
      { word: "爱好", pinyin: "ai4 hao4", definition: "hobby", knownToWrite: true },
    ]);

    expect(entries.sort((a, b) => a.char.localeCompare(b.char))).toEqual([
      { char: "好", pinyin: "hao4", writting_known: true },
      { char: "爱", pinyin: "ai4", writting_known: true },
    ]);
  });

  it("handles neutral-tone syllables with no trailing digit", () => {
    const entries = extractCharacterEntries([
      { word: "的", pinyin: "de", definition: "of", knownToWrite: false },
    ]);

    expect(entries).toEqual([{ char: "的", pinyin: "de", writting_known: false }]);
  });

  it("merges a character shared by multiple words and ORs the known flag", () => {
    const entries = extractCharacterEntries([
      { word: "爱", pinyin: "ai4", definition: "to love", knownToWrite: false },
      { word: "爱好", pinyin: "ai4 hao4", definition: "hobby", knownToWrite: true },
    ]);

    const aiEntry = entries.find((entry) => entry.char === "爱");

    expect(aiEntry).toEqual({ char: "爱", pinyin: "ai4", writting_known: true });
  });
});
