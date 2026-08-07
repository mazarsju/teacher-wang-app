import { describe, expect, it } from "vitest";
import {
  buildPinyinFromCharacterMap,
  extractMissingCharacterEntries,
  isWordPinyinValid,
  splitWordCharacters,
} from "./wordCharacters";

describe("splitWordCharacters", () => {
  it("splits a word into characters", () => {
    expect(splitWordCharacters("你好")).toEqual(["你", "好"]);
  });
});

describe("extractMissingCharacterEntries", () => {
  it("pairs each missing Chinese character with its pinyin syllable", () => {
    expect(
      extractMissingCharacterEntries("你好", "ni3 hao3", new Set(["你"])),
    ).toEqual([{ char: "好", pinyin: "hao3", writting_known: false }]);
  });

  it("returns nothing when every character is already known", () => {
    expect(
      extractMissingCharacterEntries("你好", "ni3 hao3", new Set(["你", "好"])),
    ).toEqual([]);
  });

  it("ignores non-Chinese characters", () => {
    expect(
      extractMissingCharacterEntries("A想B", "A xiang3 B", new Set([])),
    ).toEqual([{ char: "想", pinyin: "xiang3", writting_known: false }]);
  });

  it("dedupes repeated characters within the word", () => {
    expect(
      extractMissingCharacterEntries("谢谢", "xie4 xie4", new Set([])),
    ).toEqual([{ char: "谢", pinyin: "xie4", writting_known: false }]);
  });

  it("resolves each character's syllable even when the pinyin is glued together", () => {
    expect(
      extractMissingCharacterEntries("你A好", "ni3Ahao3", new Set([])),
    ).toEqual([
      { char: "你", pinyin: "ni3", writting_known: false },
      { char: "好", pinyin: "hao3", writting_known: false },
    ]);
  });
});

describe("isWordPinyinValid", () => {
  it("requires one valid syllable per Chinese character when the word is pure Chinese", () => {
    expect(isWordPinyinValid("你好", "ni3 hao3")).toBe(true);
    expect(isWordPinyinValid("你好", "ni3")).toBe(false);
    expect(isWordPinyinValid("你好", "notpinyin hao3")).toBe(false);
  });

  it("rejects glued-together or extra pinyin for a pure Chinese word", () => {
    expect(isWordPinyinValid("你好", "ni3hao3")).toBe(false);
    expect(isWordPinyinValid("你好吗", "ni3 hao3")).toBe(false);
    expect(isWordPinyinValid("你好", "ni3 hao3 ma3")).toBe(false);
  });

  it("only requires a resolvable syllable per Chinese character once a non-Chinese one is mixed in", () => {
    expect(isWordPinyinValid("你A好", "ni3 A hao3")).toBe(true);
    expect(isWordPinyinValid("你A好", "ni3Ahao3")).toBe(true);
    expect(isWordPinyinValid("你。。好", "ni3..hao3")).toBe(true);
    expect(isWordPinyinValid("你。。好", "ni3.....hao3")).toBe(true);
    expect(isWordPinyinValid("你A", "ni3 hao3")).toBe(true);
    expect(isWordPinyinValid("你好?", "ni3 hao3 ma3")).toBe(true);
  });

  it("still fails a mixed word when there aren't enough resolvable syllables", () => {
    expect(isWordPinyinValid("你A", "")).toBe(false);
    expect(isWordPinyinValid("你A好", "ni3")).toBe(false);
  });
});

describe("buildPinyinFromCharacterMap", () => {
  it("maps each Chinese character to its known HSK reading", () => {
    expect(
      buildPinyinFromCharacterMap("你好", { 你: "ni3", 好: "hao3" }),
    ).toBe("ni3 hao3");
  });

  it("falls back to the user's own character table when missing from HSK", () => {
    expect(
      buildPinyinFromCharacterMap("你好", { 你: "ni3" }, { 好: "hao3" }),
    ).toBe("ni3 hao3");
  });

  it("prefers the HSK reading over the user's own character table", () => {
    expect(
      buildPinyinFromCharacterMap("你", { 你: "ni3" }, { 你: "ni2" }),
    ).toBe("ni3");
  });

  it("uses '??' for Chinese characters missing from both sources", () => {
    expect(buildPinyinFromCharacterMap("你好", { 你: "ni3" })).toBe("ni3 ??");
    expect(
      buildPinyinFromCharacterMap("你好", { 你: "ni3" }, { 想: "xiang3" }),
    ).toBe("ni3 ??");
  });

  it("keeps non-Chinese characters as-is, one token each", () => {
    expect(buildPinyinFromCharacterMap("A想B", { 想: "xiang3" })).toBe(
      "A xiang3 B",
    );
  });
});
