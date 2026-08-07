import { describe, expect, it } from "vitest";
import type { Word } from "../../types/word";
import {
  buildWordsByCharacter,
  formatAssociatedWord,
} from "./wordsByCharacter";

describe("buildWordsByCharacter", () => {
  it("groups words by character, then by the pinyin reading used at that position", () => {
    const words: Word[] = [
      {
        word: "爱好",
        definition: "hobby",
        pinyin: "ai4 hao3",
        updated_at: "2026-07-12T12:00:00+00:00",
        characters: ["爱", "好"],
      },
      {
        word: "爱",
        definition: null,
        pinyin: "ai4",
        updated_at: "2026-07-12T12:00:00+00:00",
        characters: ["爱"],
      },
    ];

    const wordsByCharacter = buildWordsByCharacter(words);

    expect(wordsByCharacter.get("爱")?.get("ai4")).toEqual([
      {
        word: "爱",
        definition: null,
        pinyin: "ai4",
        updated_at: "2026-07-12T12:00:00+00:00",
        characters: ["爱"],
      },
      {
        word: "爱好",
        definition: "hobby",
        pinyin: "ai4 hao3",
        updated_at: "2026-07-12T12:00:00+00:00",
        characters: ["爱", "好"],
      },
    ]);
    expect(wordsByCharacter.get("好")?.get("hao3")).toEqual([
      {
        word: "爱好",
        definition: "hobby",
        pinyin: "ai4 hao3",
        updated_at: "2026-07-12T12:00:00+00:00",
        characters: ["爱", "好"],
      },
    ]);
  });

  it("keeps different pinyin readings of the same character in separate buckets", () => {
    const words: Word[] = [
      {
        word: "的",
        definition: "possessive particle",
        pinyin: "de",
        updated_at: "2026-07-12T12:00:00+00:00",
        characters: ["的"],
      },
      {
        word: "目的",
        definition: "purpose",
        pinyin: "mu4 di4",
        updated_at: "2026-07-12T12:00:00+00:00",
        characters: ["目", "的"],
      },
    ];

    const wordsByCharacter = buildWordsByCharacter(words);

    expect(wordsByCharacter.get("的")?.get("de")?.map((word) => word.word)).toEqual([
      "的",
    ]);
    expect(
      wordsByCharacter.get("的")?.get("di4")?.map((word) => word.word),
    ).toEqual(["目的"]);
  });
});

describe("formatAssociatedWord", () => {
  it("includes the definition in parentheses when present", () => {
    expect(
      formatAssociatedWord({
        word: "爱好",
        definition: "hobby",
        pinyin: "ai4 hao3",
        updated_at: "2026-07-12T12:00:00+00:00",
        characters: ["爱", "好"],
      }),
    ).toBe("爱好 (hobby)");
  });

  it("omits parentheses when the definition is empty", () => {
    expect(
      formatAssociatedWord({
        word: "爱",
        definition: null,
        pinyin: null,
        updated_at: "2026-07-12T12:00:00+00:00",
        characters: ["爱"],
      }),
    ).toBe("爱");
  });
});
