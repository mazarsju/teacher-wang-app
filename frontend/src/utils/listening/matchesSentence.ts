// Ignores whitespace and punctuation everywhere (not just trailing) since a
// spoken/STT answer rarely reproduces punctuation the way typed text does.
const PUNCTUATION_RE = /[\s，。！？：；、"'""''~～,.!?:;]/g;

export function normalizeForComparison(text: string): string {
  return text.replace(PUNCTUATION_RE, "");
}

export function matchesSentence(input: string, expected: string): boolean {
  return normalizeForComparison(input) === normalizeForComparison(expected);
}
