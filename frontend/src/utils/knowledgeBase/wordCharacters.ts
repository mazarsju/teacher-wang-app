export function splitWordCharacters(word: string): string[] {
  return [...word];
}

export function getMissingCharacters(
  word: string,
  knownCharacters: Set<string>,
): string[] {
  const missing = new Set<string>();

  for (const character of splitWordCharacters(word)) {
    if (!knownCharacters.has(character)) {
      missing.add(character);
    }
  }

  return [...missing];
}
