import { describe, expect, it } from "vitest";
import {
  extractCharacterEntries,
  normalizeImportPinyin,
} from "./buildImportLines";

describe("normalizeImportPinyin", () => {
  it("normalizes each syllable with Anki rules", () => {
    expect(normalizeImportPinyin("Qīn nue3 r")).toBe("qin1 nüe3 er");
  });

  it("keeps unresolvable tokens as-is", () => {
    expect(normalizeImportPinyin("xyz9 ai4")).toBe("xyz9 ai4");
  });
});

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

  it("normalizes Anki-style syllables before assigning them", () => {
    const entries = extractCharacterEntries([
      {
        word: "花儿",
        pinyin: "Hua1 r",
        definition: "flower (erhua)",
        knownToWrite: true,
      },
    ]);

    expect(entries.sort((a, b) => a.char.localeCompare(b.char))).toEqual([
      { char: "儿", pinyin: "er", writting_known: true },
      { char: "花", pinyin: "hua1", writting_known: true },
    ]);
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
