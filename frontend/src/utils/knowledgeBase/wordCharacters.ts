import { isHanCharacter } from "./chineseCharacters";
import { isValidPinyin } from "../../types/pinyin";

export function splitWordCharacters(word: string): string[] {
  return [...word];
}

/**
 * Split a word into pinyin-matchable segments: each Han character stands on
 * its own, while consecutive non-Han characters (e.g. "A" in "A想B") are
 * grouped into a single literal segment.
 */
export function splitWordSegments(word: string): string[] {
  const segments: string[] = [];
  let buffer = "";

  for (const character of word) {
    if (isHanCharacter(character)) {
      if (buffer !== "") {
        segments.push(buffer);
        buffer = "";
      }
      segments.push(character);
    } else {
      buffer += character;
    }
  }
  if (buffer !== "") {
    segments.push(buffer);
  }

  return segments;
}

/**
 * A word's pinyin is valid when it has exactly one space-separated token per
 * segment (see `splitWordSegments`): a valid pinyin syllable for each Han
 * character, and the exact literal text for each non-Han run.
 */
export function isWordPinyinValid(word: string, pinyinInput: string): boolean {
  const segments = splitWordSegments(word.trim());
  const tokens = pinyinInput
    .trim()
    .split(/\s+/)
    .filter((token) => token !== "");

  if (segments.length === 0 || tokens.length !== segments.length) {
    return false;
  }

  return segments.every((segment, index) =>
    isHanCharacter(segment) ? isValidPinyin(tokens[index]) : tokens[index] === segment,
  );
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
