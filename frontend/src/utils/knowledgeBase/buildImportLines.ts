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
  writting_known: boolean;
};

/**
 * Derive the unique characters (with merged pinyin/known-to-write) needed to
 * bulk-create every word in `rows`.
 *
 * ponytail: assumes one space-separated numeric-pinyin syllable per
 * character, aligned by index (true for HSK data — see
 * normalize_hsk_numeric_pinyin). Falls back to the first syllable when a
 * word has fewer syllables than characters.
 */
export function extractCharacterEntries(rows: SmartWordRow[]): CharacterEntry[] {
  const byCharacter = new Map<string, CharacterEntry>();

  for (const row of rows) {
    const characters = splitWordCharacters(row.word);
    const syllables = row.pinyin.split(" ").filter((syllable) => syllable !== "");

    characters.forEach((character, index) => {
      const syllable = syllables[index] ?? syllables[0] ?? "";

      const existing = byCharacter.get(character);
      if (existing) {
        existing.writting_known = existing.writting_known || row.knownToWrite;
      } else {
        byCharacter.set(character, {
          char: character,
          pinyin: syllable,
          writting_known: row.knownToWrite,
        });
      }
    });
  }

  return Array.from(byCharacter.values());
}
