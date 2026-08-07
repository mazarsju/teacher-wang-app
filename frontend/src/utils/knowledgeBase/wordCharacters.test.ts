import { describe, expect, it } from "vitest";
import {
  buildPinyinFromCharacterMap,
  getMissingCharacters,
  isWordPinyinValid,
  splitWordCharacters,
} from "./wordCharacters";

describe("splitWordCharacters", () => {
  it("splits a word into characters", () => {
    expect(splitWordCharacters("你好")).toEqual(["你", "好"]);
  });
});

describe("getMissingCharacters", () => {
  it("returns characters not in the known set", () => {
    expect(getMissingCharacters("你好", new Set(["你"]))).toEqual(["好"]);
    expect(getMissingCharacters("你好", new Set(["你", "好"]))).toEqual([]);
  });

  it("ignores non-Chinese characters", () => {
    expect(getMissingCharacters("A想B", new Set([]))).toEqual(["想"]);
    expect(getMissingCharacters("A想B", new Set(["想"]))).toEqual([]);
  });
});

describe("isWordPinyinValid", () => {
  it("requires one valid syllable per Chinese character", () => {
    expect(isWordPinyinValid("你好", "ni3 hao3")).toBe(true);
    expect(isWordPinyinValid("你好", "ni3")).toBe(false);
    expect(isWordPinyinValid("你好", "notpinyin hao3")).toBe(false);
  });

  it("requires the literal character for each non-Chinese one", () => {
    expect(isWordPinyinValid("A想B", "A xiang3 B")).toBe(true);
    expect(isWordPinyinValid("A想B", "a xiang3 B")).toBe(false);
    expect(isWordPinyinValid("AB想", "A B xiang3")).toBe(true);
    expect(isWordPinyinValid("AB想", "AB xiang3")).toBe(false);
  });
});

describe("buildPinyinFromCharacterMap", () => {
  it("maps each Chinese character to its known reading", () => {
    expect(
      buildPinyinFromCharacterMap("你好", { 你: "ni3", 好: "hao3" }),
    ).toBe("ni3 hao3");
  });

  it("uses '??' for Chinese characters missing from the map", () => {
    expect(buildPinyinFromCharacterMap("你好", { 你: "ni3" })).toBe("ni3 ??");
  });

  it("keeps non-Chinese characters as-is, one token each", () => {
    expect(buildPinyinFromCharacterMap("A想B", { 想: "xiang3" })).toBe(
      "A xiang3 B",
    );
  });
});
