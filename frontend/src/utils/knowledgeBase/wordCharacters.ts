import { isHanCharacter } from "./chineseCharacters";
import { isValidPinyin } from "../../types/pinyin";

export function splitWordCharacters(word: string): string[] {
  return [...word];
}

/**
 * A word's pinyin is valid when it has exactly one space-separated token per
 * character: a valid pinyin syllable for each Han character, and the exact
 * literal character for each non-Han one (e.g. "A想B" → "A xiang3 B").
 */
export function isWordPinyinValid(word: string, pinyinInput: string): boolean {
  const characters = splitWordCharacters(word.trim());
  const tokens = pinyinInput
    .trim()
    .split(/\s+/)
    .filter((token) => token !== "");

  if (characters.length === 0 || tokens.length !== characters.length) {
    return false;
  }

  return characters.every((character, index) =>
    isHanCharacter(character)
      ? isValidPinyin(tokens[index])
      : tokens[index] === character,
  );
}

/**
 * Auto-fill a word's pinyin from known character readings: each Han
 * character becomes its `hskCharacterPinyin` reading, falling back to its
 * reading in the user's own `userCharacterPinyin` character table, then to
 * "??" when neither has it. Each non-Han character is kept as-is — one
 * space-separated token per character.
 */
export function buildPinyinFromCharacterMap(
  word: string,
  hskCharacterPinyin: Record<string, string>,
  userCharacterPinyin: Record<string, string> = {},
): string {
  return splitWordCharacters(word)
    .map((character) =>
      isHanCharacter(character)
        ? hskCharacterPinyin[character] ||
          userCharacterPinyin[character] ||
          "??"
        : character,
    )
    .join(" ");
}

export type MissingCharacterEntry = {
  char: string;
  pinyin: string;
  writting_known: boolean;
};

/**
 * Chinese characters in `word` that aren't in `knownCharacters` yet, each
 * paired with the pinyin syllable at the same position — word and pinyin are
 * already one token per character by the time a word form can be submitted
 * (see `isWordPinyinValid`). Deduplicated; non-Han characters (e.g. "A" in
 * "A想B") are never candidates since the character table only holds Han
 * characters.
 */
export function extractMissingCharacterEntries(
  word: string,
  pinyin: string,
  knownCharacters: Set<string>,
): MissingCharacterEntry[] {
  const characters = splitWordCharacters(word);
  const tokens = pinyin
    .trim()
    .split(/\s+/)
    .filter((token) => token !== "");

  const seen = new Set<string>();
  const entries: MissingCharacterEntry[] = [];

  characters.forEach((character, index) => {
    if (
      !isHanCharacter(character) ||
      knownCharacters.has(character) ||
      seen.has(character)
    ) {
      return;
    }
    seen.add(character);
    entries.push({
      char: character,
      pinyin: tokens[index] ?? "",
      writting_known: false,
    });
  });

  return entries;
}
