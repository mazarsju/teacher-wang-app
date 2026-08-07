import type { Word } from "../../types/word";

// character -> pinyin reading -> words using that character with that reading
export function buildWordsByCharacter(
  words: Word[],
): Map<string, Map<string, Word[]>> {
  const map = new Map<string, Map<string, Word[]>>();

  for (const word of words) {
    const pinyinTokens = word.pinyin?.trim().split(/\s+/) ?? [];

    word.characters.forEach((character, index) => {
      const pinyin = pinyinTokens[index] ?? "";
      const byPinyin = map.get(character) ?? new Map<string, Word[]>();
      const existing = byPinyin.get(pinyin) ?? [];
      existing.push(word);
      byPinyin.set(pinyin, existing);
      map.set(character, byPinyin);
    });
  }

  for (const byPinyin of map.values()) {
    for (const [pinyin, characterWords] of byPinyin) {
      byPinyin.set(
        pinyin,
        [...characterWords].sort((left, right) =>
          left.word.localeCompare(right.word),
        ),
      );
    }
  }

  return map;
}

export function formatAssociatedWord(word: Word): string {
  const definition = word.definition?.trim();
  if (definition) {
    return `${word.word} (${definition})`;
  }

  return word.word;
}
