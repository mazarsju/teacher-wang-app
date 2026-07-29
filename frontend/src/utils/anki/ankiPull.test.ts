import { describe, expect, it } from "vitest";
import {
  buildPinyinGuessMap,
  pairWrittingWithPinyinTokens,
  uniqueCharactersToCreate,
  vocabularyPullCardsFromNotes,
  writtingPullFromNotes,
} from "./ankiPull";

describe("pairWrittingWithPinyinTokens", () => {
  it("pairs Han characters with normalized pinyin tokens", () => {
    expect(pairWrittingWithPinyinTokens("水火", "shui3 huo3")).toEqual([
      ["水", "shui3"],
      ["火", "huo3"],
    ]);
  });
});

describe("buildPinyinGuessMap", () => {
  it("guesses character pinyin from notes", () => {
    expect(
      buildPinyinGuessMap([
        { writting: "水", pinyin: "shui3", definition: "water" },
      ]),
    ).toEqual({ 水: "shui3" });
  });
});

describe("vocabularyPullCardsFromNotes", () => {
  it("returns pullable cards and skips local/ignored words", () => {
    const result = vocabularyPullCardsFromNotes(
      [
        { writting: "水", pinyin: "shui3", definition: "water" },
        { writting: "火", pinyin: "huo3", definition: "fire" },
        { writting: "风", pinyin: "feng1", definition: "wind" },
      ],
      new Set(["水"]),
      new Set(["火"]),
      new Map(),
    );

    expect(result.cards).toEqual([
      {
        id: "风",
        writting: "风",
        pinyin: "feng1",
        definition: "wind",
        characters_to_create: ["风"],
      },
    ]);
    expect(result.autoIgnore).toEqual([]);
  });

  it("auto-ignores cards longer than 10 characters", () => {
    const long = "一二三四五六七八九十甲";
    const result = vocabularyPullCardsFromNotes(
      [{ writting: long, pinyin: "", definition: "x" }],
      new Set(),
      new Set(),
      new Map(),
    );
    expect(result.autoIgnore).toEqual([long]);
    expect(result.cards).toEqual([]);
  });
});

describe("writtingPullFromNotes", () => {
  it("pulls characters that exist but are not writting_known", () => {
    const result = writtingPullFromNotes(
      [{ recto: "water (shui3)", verso: "水" }],
      new Set(),
      new Map([
        [
          "水",
          {
            char: "水",
            pinyin: "shui3",
            writting_known: false,
            synchronized: false,
          },
        ],
      ]),
    );

    expect(result.pullCards).toEqual([
      {
        id: "水",
        recto: "shui3",
        verso: "水",
        anki_recto: "water (shui3)",
      },
    ]);
  });
});

describe("uniqueCharactersToCreate", () => {
  it("deduplicates characters across cards", () => {
    expect(
      uniqueCharactersToCreate([
        {
          id: "水火",
          writting: "水火",
          pinyin: "shui3 huo3",
          definition: "x",
          characters_to_create: ["水", "火"],
        },
        {
          id: "火",
          writting: "火",
          pinyin: "huo3",
          definition: "y",
          characters_to_create: ["火"],
        },
      ]),
    ).toEqual(["水", "火"]);
  });
});
