import { describe, expect, it } from "vitest";
import {
  pairWritingWithPinyinTokens,
  uniqueCharactersToCreate,
  uniqueHanCharactersFromWords,
  vocabularyPullCardsFromNotes,
  writingPullFromNotes,
} from "./ankiPull";

describe("pairWritingWithPinyinTokens", () => {
  it("pairs Han characters with normalized pinyin tokens", () => {
    expect(pairWritingWithPinyinTokens("水火", "shui3 huo3")).toEqual([
      ["水", "shui3"],
      ["火", "huo3"],
    ]);
  });
});

describe("vocabularyPullCardsFromNotes", () => {
  it("returns pullable cards and skips local/ignored words", () => {
    const result = vocabularyPullCardsFromNotes(
      [
        { writing: "水", pinyin: "shui3", definition: "water" },
        { writing: "火", pinyin: "huo3", definition: "fire" },
        { writing: "风", pinyin: "feng1", definition: "wind" },
      ],
      new Set(["水"]),
      new Set(["火"]),
      new Map(),
    );

    expect(result.cards).toEqual([
      {
        id: "风",
        writing: "风",
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
      [{ writing: long, pinyin: "", definition: "x" }],
      new Set(),
      new Set(),
      new Map(),
    );
    expect(result.autoIgnore).toEqual([long]);
    expect(result.cards).toEqual([]);
  });

  it("guesses missing pinyin from the HSK character map, like AddWordModal", () => {
    const result = vocabularyPullCardsFromNotes(
      [{ writing: "风", pinyin: "", definition: "wind" }],
      new Set(),
      new Set(),
      new Map(),
      { 风: "feng1" },
    );

    expect(result.cards).toEqual([
      {
        id: "风",
        writing: "风",
        pinyin: "",
        definition: "wind",
        characters_to_create: ["风"],
      },
    ]);
  });

  it("marks a card missing when neither the field nor the HSK map resolves a character", () => {
    const result = vocabularyPullCardsFromNotes(
      [{ writing: "风水", pinyin: "feng1 ??", definition: "feng shui" }],
      new Set(),
      new Set(),
      new Map(),
      { 风: "feng1" },
    );

    expect(result.cards).toEqual([]);
    expect(result.missing).toEqual(["风水"]);
  });

  it("resolves pinyin glued to punctuation instead of marking the card missing", () => {
    const result = vocabularyPullCardsFromNotes(
      [
        {
          writing: "…好了吗?",
          pinyin: "...hao3 le ma?",
          definition: "is it good now?",
        },
        {
          writing: "...行吗?",
          pinyin: "...xing2 ma?",
          definition: "is that ok?",
        },
        { writing: "(公)园", pinyin: "(gong1) yuan2", definition: "park" },
      ],
      new Set(),
      new Set(),
      new Map(),
    );

    expect(result.missing).toEqual([]);
    expect(new Set(result.cards.map((card) => card.writing))).toEqual(
      new Set(["…好了吗?", "...行吗?", "(公)园"]),
    );
    expect(
      result.cards.find((card) => card.writing === "…好了吗?")
        ?.characters_to_create,
    ).toEqual(["好", "了", "吗"]);
    expect(
      result.cards.find((card) => card.writing === "(公)园")
        ?.characters_to_create,
    ).toEqual(["公", "园"]);
  });
});

describe("writingPullFromNotes", () => {
  it("pulls words that exist locally but are not writing_known", () => {
    const result = writingPullFromNotes(
      [{ recto: "water (shui3)", verso: "水" }],
      new Set(["水"]),
      new Set(),
      new Set(),
    );

    expect(result.pullCards).toEqual([
      {
        id: "水",
        recto: "water (shui3)",
        verso: "水",
      },
    ]);
    expect(result.missing).toEqual([]);
  });

  it("marks a word missing when it doesn't exist locally", () => {
    const result = writingPullFromNotes(
      [{ recto: "water (shui3)", verso: "水" }],
      new Set(),
      new Set(),
      new Set(),
    );

    expect(result.pullCards).toEqual([]);
    expect(result.missing).toEqual(["水"]);
  });

  it("skips words already marked writing_known", () => {
    const result = writingPullFromNotes(
      [{ recto: "water (shui3)", verso: "水" }],
      new Set(["水"]),
      new Set(["水"]),
      new Set(),
    );

    expect(result.pullCards).toEqual([]);
    expect(result.missing).toEqual([]);
  });
});

describe("uniqueHanCharactersFromWords", () => {
  it("dedupes Han characters across words and skips non-Han input", () => {
    expect(uniqueHanCharactersFromWords(["孤独", "孤单", "abc?"])).toEqual([
      "孤",
      "独",
      "单",
    ]);
  });
});

describe("uniqueCharactersToCreate", () => {
  it("deduplicates characters across cards", () => {
    expect(
      uniqueCharactersToCreate([
        {
          id: "水火",
          writing: "水火",
          pinyin: "shui3 huo3",
          definition: "x",
          characters_to_create: ["水", "火"],
        },
        {
          id: "火",
          writing: "火",
          pinyin: "huo3",
          definition: "y",
          characters_to_create: ["火"],
        },
      ]),
    ).toEqual(["水", "火"]);
  });
});
