import { isHanCharacter } from "./chineseCharacters";
import { isValidPinyin } from "../../types/pinyin";

export function splitWordCharacters(word: string): string[] {
  return [...word];
}

const MAX_PINYIN_SYLLABLE_LENGTH = 8;
const PINYIN_START_CHAR = /^[a-zü]$/;

/**
 * Scan `text` left to right for up to `count` pinyin syllables (lowercase,
 * tone digit optional — neutral-tone particles like "le" and "ma" are
 * common), skipping any other character — letters, digits, punctuation,
 * whitespace, anything. Used to find each Chinese character's pinyin when
 * the field also holds non-Chinese filler (parentheses, ellipses, question
 * marks, ...) that doesn't need to align with real character positions.
 *
 * ponytail: requiring the scan to start on a lowercase letter keeps a stray
 * placeholder like "A" from being mistaken for the bare pinyin final "a";
 * an embedded pinyin-shaped substring hiding inside longer literal filler
 * can still false-match, which is acceptable since the filler itself is
 * intentionally unchecked.
 */
export function extractToneSyllablesInOrder(
  text: string,
  count: number,
): string[] | null {
  const matches: string[] = [];
  let i = 0;
  while (i < text.length && matches.length < count) {
    if (!PINYIN_START_CHAR.test(text[i])) {
      i += 1;
      continue;
    }
    let matchedLength = 0;
    for (
      let length = Math.min(MAX_PINYIN_SYLLABLE_LENGTH, text.length - i);
      length > 0;
      length -= 1
    ) {
      const candidate = text.slice(i, i + length);
      // Reject a candidate that only validates because isValidPinyin trims
      // it internally (e.g. "hao3 " -> "hao3"); the exact span must already
      // be clean so a trailing space on a longer candidate can't shadow a
      // clean, shorter match.
      if (/\s$/.test(candidate)) {
        continue;
      }
      if (isValidPinyin(candidate)) {
        matchedLength = length;
        break;
      }
    }
    if (matchedLength > 0) {
      matches.push(text.slice(i, i + matchedLength));
      i += matchedLength;
    } else {
      i += 1;
    }
  }
  return matches.length === count ? matches : null;
}

/**
 * A word's pinyin is valid when every Chinese character has a resolvable
 * syllable. A word made entirely of Chinese characters keeps the exact,
 * space-aligned rule (one valid syllable per character, nothing extra). A
 * word mixed with non-Chinese characters (e.g. "你A好", "你好?") is checked
 * loosely instead: only that a valid syllable for each Chinese character
 * appears in order somewhere in the field — its exact spelling, spacing, or
 * count for the non-Chinese parts is never checked.
 */
export function isWordPinyinValid(word: string, pinyinInput: string): boolean {
  const characters = splitWordCharacters(word.trim());
  const hanCount = characters.filter(isHanCharacter).length;
  if (hanCount === 0) {
    return false;
  }

  if (hanCount === characters.length) {
    const tokens = pinyinInput
      .trim()
      .split(/\s+/)
      .filter((token) => token !== "");
    return (
      tokens.length === characters.length &&
      tokens.every((token) => isValidPinyin(token))
    );
  }

  return extractToneSyllablesInOrder(pinyinInput, hanCount) !== null;
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
 * paired with its resolved pinyin syllable (see `isWordPinyinValid` for how
 * that's found when `word` mixes in non-Chinese characters). Deduplicated;
 * non-Han characters (e.g. "A" in "A想B") are never candidates since the
 * character table only holds Han characters.
 */
export function extractMissingCharacterEntries(
  word: string,
  pinyin: string,
  knownCharacters: Set<string>,
): MissingCharacterEntry[] {
  const characters = splitWordCharacters(word);
  const hanCharacters = characters.filter(isHanCharacter);
  const hasNonHan = hanCharacters.length < characters.length;

  const hanPinyin = hasNonHan
    ? extractToneSyllablesInOrder(pinyin, hanCharacters.length)
    : pinyin.trim().split(/\s+/).filter((token) => token !== "");

  const seen = new Set<string>();
  const entries: MissingCharacterEntry[] = [];

  hanCharacters.forEach((character, index) => {
    if (knownCharacters.has(character) || seen.has(character)) {
      return;
    }
    seen.add(character);
    entries.push({
      char: character,
      pinyin: hanPinyin?.[index] ?? "",
      writting_known: false,
    });
  });

  return entries;
}
