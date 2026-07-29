import { describe, expect, it } from "vitest";
import type { Word } from "../../types/word";
import {
  buildWordsByCharacter,
  formatAssociatedWord,
} from "./wordsByCharacter";

describe("buildWordsByCharacter", () => {
  it("groups words by their linked characters", () => {
    const words: Word[] = [
      {
        word: "爱好",
        definition: "hobby",
        updated_at: "2026-07-12T12:00:00+00:00",
        characters: ["爱", "好"],
      },
      {
        word: "爱",
        definition: null,
        updated_at: "2026-07-12T12:00:00+00:00",
        characters: ["爱"],
      },
    ];

    const wordsByCharacter = buildWordsByCharacter(words);

    expect(wordsByCharacter.get("爱")).toEqual([
      {
        word: "爱",
        definition: null,
        updated_at: "2026-07-12T12:00:00+00:00",
        characters: ["爱"],
      },
      {
        word: "爱好",
        definition: "hobby",
        updated_at: "2026-07-12T12:00:00+00:00",
        characters: ["爱", "好"],
      },
    ]);
    expect(wordsByCharacter.get("好")).toEqual([
      {
        word: "爱好",
        definition: "hobby",
        updated_at: "2026-07-12T12:00:00+00:00",
        characters: ["爱", "好"],
      },
    ]);
  });
});

describe("formatAssociatedWord", () => {
  it("includes the definition in parentheses when present", () => {
    expect(
      formatAssociatedWord({
        word: "爱好",
        definition: "hobby",
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
        updated_at: "2026-07-12T12:00:00+00:00",
        characters: ["爱"],
      }),
    ).toBe("爱");
  });
});
