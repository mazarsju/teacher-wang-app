import type { Word } from "../../types/word";

export function buildWordsByCharacter(words: Word[]): Map<string, Word[]> {
  const map = new Map<string, Word[]>();

  for (const word of words) {
    for (const character of word.characters) {
      const existing = map.get(character) ?? [];
      existing.push(word);
      map.set(character, existing);
    }
  }

  for (const [character, characterWords] of map) {
    map.set(
      character,
      [...characterWords].sort((left, right) =>
        left.word.localeCompare(right.word),
      ),
    );
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
