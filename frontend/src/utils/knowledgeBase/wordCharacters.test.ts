import { describe, expect, it } from "vitest";
import { getMissingCharacters, splitWordCharacters } from "./wordCharacters";

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
});
