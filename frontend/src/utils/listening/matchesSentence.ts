// Ignores whitespace and punctuation everywhere (not just trailing) since a
// spoken/STT answer rarely reproduces punctuation the way typed text does.
const PUNCTUATION_CHARS = "\\s，。！？：；、\"'\"\"''~～,.!?:;";
const PUNCTUATION_RE = new RegExp(`[${PUNCTUATION_CHARS}]`, "g");
const PUNCTUATION_CHAR_RE = new RegExp(`[${PUNCTUATION_CHARS}]`);

export function normalizeForComparison(text: string): string {
  return text.replace(PUNCTUATION_RE, "");
}

export function matchesSentence(input: string, expected: string): boolean {
  return normalizeForComparison(input) === normalizeForComparison(expected);
}

export type SentenceCharDiff = {
  char: string;
  // null for punctuation/whitespace, which is never colored
  matched: boolean | null;
};

// Indices into `a` that participate in the longest common subsequence with
// `b`, so a dropped/extra character doesn't shift every later char out of
// alignment.
function longestCommonSubsequenceIndices(a: string[], b: string[]): Set<number> {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const indices = new Set<number>();
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      indices.add(i);
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return indices;
}

export function diffSentenceChars(
  input: string,
  expected: string,
): SentenceCharDiff[] {
  const expectedChars = Array.from(expected);
  const expectedIndices: number[] = [];
  const expectedNormalized: string[] = [];
  expectedChars.forEach((char, index) => {
    if (!PUNCTUATION_CHAR_RE.test(char)) {
      expectedIndices.push(index);
      expectedNormalized.push(char);
    }
  });
  const inputNormalized = Array.from(normalizeForComparison(input));
  const matchedPositions = longestCommonSubsequenceIndices(
    expectedNormalized,
    inputNormalized,
  );
  const matchedOriginalIndices = new Set(
    expectedIndices.filter((_, position) => matchedPositions.has(position)),
  );

  return expectedChars.map((char, index) => {
    if (PUNCTUATION_CHAR_RE.test(char)) {
      return { char, matched: null };
    }
    return { char, matched: matchedOriginalIndices.has(index) };
  });
}
