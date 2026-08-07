const HAN_CHARACTER_PATTERN = /^\p{Script=Han}$/u;

export function isHanCharacter(value: string): boolean {
  return HAN_CHARACTER_PATTERN.test(value);
}

export function isValidCharacter(value: string): boolean {
  const trimmed = value.trim();
  return [...trimmed].length === 1 && isHanCharacter(trimmed);
}
