import { describe, expect, it } from "vitest";
import {
  isInvalidPinyinSyllable,
  isValidPinyin,
  normalizeAnkiPinyinToken,
  parsePinyinSyllable,
  parseTone,
  suggestUmlautPinyin,
} from "./pinyin";

describe("parsePinyinSyllable", () => {
  it.each([
    ["ai4", { start: "", final: "ai" }],
    ["bei3", { start: "b", final: "ei" }],
    ["zhong1", { start: "zh", final: "ong" }],
    ["üe4", { start: "", final: "üe" }],
  ])("parses %s into start and final", (value, expected) => {
    expect(parsePinyinSyllable(value)).toEqual(expected);
  });

  it.each(["", "xyz", "ai5"])("returns null for invalid pinyin %s", (value) => {
    expect(parsePinyinSyllable(value)).toBeNull();
  });
});

describe("parseTone", () => {
  it.each([
    ["ai1", 1],
    ["bei2", 2],
    ["zhong3", 3],
    ["üe4", 4],
  ])("parses tone from %s", (value, expected) => {
    expect(parseTone(value)).toBe(expected);
  });

  it.each(["ai", "zhong", "", "   "])(
    "returns null when pinyin has no tone %s",
    (value) => {
      expect(parseTone(value)).toBeNull();
    },
  );
});

describe("isInvalidPinyinSyllable", () => {
  it.each([
    ["b", "e"],
    ["", "ong"],
    ["f", "ai"],
  ])("marks %s + %s as invalid", (start, final) => {
    expect(isInvalidPinyinSyllable(start, final)).toBe(true);
  });

  it.each([
    ["", "ai"],
    ["b", "ei"],
    ["h", "ao"],
  ])("marks %s + %s as valid", (start, final) => {
    expect(isInvalidPinyinSyllable(start, final)).toBe(false);
  });
});

describe("isValidPinyin", () => {
  it.each([
    "ai",
    "ai4",
    "zhong",
    "zhong1",
    "bei3",
    "üe4",
  ])("accepts valid pinyin %s", (value) => {
    expect(isValidPinyin(value)).toBe(true);
  });

  it.each(["", "   ", "xyz", "b", "ai5", "zzang"])(
    "rejects invalid pinyin %s",
    (value) => {
      expect(isValidPinyin(value)).toBe(false);
    },
  );
});

describe("suggestUmlautPinyin", () => {
  it.each([
    ["lue", "lüe"],
    ["lue4", "lüe4"],
    ["nue", "nüe"],
    ["ue", "üe"],
    ["  LUE3  ", "LÜE3"],
  ])("suggests %s → %s", (value, expected) => {
    expect(suggestUmlautPinyin(value)).toBe(expected);
  });

  it.each(["", "   ", "xyz", "invalid", "ai5", "ai4", "lu", "nu4", "lüe"])(
    "returns null for %s",
    (value) => {
      expect(suggestUmlautPinyin(value)).toBeNull();
    },
  );
});

describe("normalizeAnkiPinyinToken", () => {
  it.each([
    ["Qīn", "qin1"],
    ["Ai3", "ai3"],
    ["nue3", "nüe3"],
    ["r", "er"],
    ["r2", "er2"],
  ])("normalizes %s → %s", (value, expected) => {
    expect(normalizeAnkiPinyinToken(value)).toBe(expected);
  });

  it.each(["", "xyz9"])("returns null for %s", (value) => {
    expect(normalizeAnkiPinyinToken(value)).toBeNull();
  });
});
