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
 * character becomes its `pinyinByCharacter` reading (or "??" when unknown),
 * and each non-Han character is kept as-is — one space-separated token per
 * character.
 */
export function buildPinyinFromCharacterMap(
  word: string,
  pinyinByCharacter: Record<string, string>,
): string {
  return splitWordCharacters(word)
    .map((character) =>
      isHanCharacter(character)
        ? pinyinByCharacter[character] || "??"
        : character,
    )
    .join(" ");
}

/** Only Chinese characters need to exist in the database; anything else in
 * the word (e.g. "A" in "A想B") is never a candidate to add there. */
export function getMissingCharacters(
  word: string,
  knownCharacters: Set<string>,
): string[] {
  const missing = new Set<string>();

  for (const character of splitWordCharacters(word)) {
    if (isHanCharacter(character) && !knownCharacters.has(character)) {
      missing.add(character);
    }
  }

  return [...missing];
}
