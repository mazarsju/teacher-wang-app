import { normalizeAnkiPinyinToken } from "../../types/pinyin";
import { splitWordCharacters } from "./wordCharacters";

export type SmartWordRow = {
  word: string;
  pinyin: string;
  definition: string;
  knownToWrite: boolean;
};

export type CharacterEntry = {
  char: string;
  pinyin: string;
  writing_known: boolean;
};

/**
 * Normalize a space-separated word pinyin string for import (Anki / HSK /
 * smart-deck). Each syllable goes through ``normalizeAnkiPinyinToken``;
 * unfixable tokens are kept as-is so callers can still surface them.
 */
export function normalizeImportPinyin(pinyin: string): string {
  return pinyin
    .split(/\s+/)
    .filter((syllable) => syllable !== "")
    .map((syllable) => normalizeAnkiPinyinToken(syllable) ?? syllable)
    .join(" ");
}

/**
 * Derive the unique characters (with merged pinyin/known-to-write) needed to
 * bulk-create every word in `rows`.
 *
 * ponytail: assumes one space-separated numeric-pinyin syllable per
 * character, aligned by index (true for HSK data — see
 * normalize_hsk_numeric_pinyin). Falls back to the first syllable when a
 * word has fewer syllables than characters. Syllables are normalized with
 * the same Anki rules used on pull-import.
 */
export function extractCharacterEntries(rows: SmartWordRow[]): CharacterEntry[] {
  const byCharacter = new Map<string, CharacterEntry>();

  for (const row of rows) {
    const characters = splitWordCharacters(row.word);
    const syllables = normalizeImportPinyin(row.pinyin)
      .split(" ")
      .filter((syllable) => syllable !== "");

    characters.forEach((character, index) => {
      const syllable = syllables[index] ?? syllables[0] ?? "";

      const existing = byCharacter.get(character);
      if (existing) {
        existing.writing_known = existing.writing_known || row.knownToWrite;
      } else {
        byCharacter.set(character, {
          char: character,
          pinyin: syllable,
          writing_known: row.knownToWrite,
        });
      }
    });
  }

  return Array.from(byCharacter.values());
}
