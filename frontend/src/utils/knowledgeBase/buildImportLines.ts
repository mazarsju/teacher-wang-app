import { splitWordCharacters } from "./wordCharacters";

export type SmartWordRow = {
  word: string;
  pinyin: string;
  definition: string;
  knownToWrite: boolean;
};

type CharacterLine = {
  base: string;
  tone: string;
  known: boolean;
  words: Set<string>;
};

/**
 * Build `character;pinyin;tone;known;words` lines (the bulk-import format,
 * see backend/routes/bulk_characters.py) from smart-creation word picks.
 *
 * ponytail: assumes one space-separated numeric-pinyin syllable per
 * character, aligned by index (true for HSK data — see
 * normalize_hsk_numeric_pinyin). Falls back to the first syllable when a
 * word has fewer syllables than characters.
 */
export function buildImportFileContent(rows: SmartWordRow[]): string {
  const byCharacter = new Map<string, CharacterLine>();

  for (const row of rows) {
    const characters = splitWordCharacters(row.word);
    const syllables = row.pinyin.split(" ").filter((syllable) => syllable !== "");

    characters.forEach((character, index) => {
      const syllable = syllables[index] ?? syllables[0] ?? "";
      const match = syllable.match(/^(.*?)(\d)?$/);
      const base = match?.[1] ?? syllable;
      const tone = match?.[2] ?? "";

      const existing = byCharacter.get(character);
      if (existing) {
        existing.known = existing.known || row.knownToWrite;
        existing.words.add(row.word);
      } else {
        byCharacter.set(character, {
          base,
          tone,
          known: row.knownToWrite,
          words: new Set([row.word]),
        });
      }
    });
  }

  return Array.from(byCharacter.entries())
    .map(
      ([character, line]) =>
        `${character};${line.base};${line.tone};${line.known};${Array.from(
          line.words,
        ).join(",")}`,
    )
    .join("\n");
}
