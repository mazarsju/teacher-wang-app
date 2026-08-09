import type { HskWord } from "../../types/hskWord";
import { API_BASE } from "../apiBase";
import { apiFetch } from "../auth/apiFetch";

export type WordPickState = {
  currentIndex: number;
  previousIndex: number;
  increment: number;
};

export type WordPickDecision = "can_write" | "can_recognize" | "dont_know";

export type WordPickResponse = {
  word: HskWord | null;
  state: WordPickState;
  wordsBetween: HskWord[];
};

export const INITIAL_WORD_PICK_STATE: WordPickState = {
  currentIndex: 0,
  previousIndex: -1,
  increment: 1,
};

/**
 * Apply a wizard decision (or none, for the very first pick) to the
 * frequency-ordered HSK word walk and return the next candidate.
 *
 * The wizard step owns `state`/`excludeWords` (this endpoint is stateless)
 * and must persist the returned `state` for the following call.
 */
export async function pickNextHskWord(
  state: WordPickState,
  decision: WordPickDecision | null,
  excludeWords: string[] = [],
): Promise<WordPickResponse> {
  const response = await apiFetch(`${API_BASE}/hsk-words/next`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      decision,
      current_index: state.currentIndex,
      previous_index: state.previousIndex,
      increment: state.increment,
      exclude: excludeWords,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to pick the next word.");
  }

  const payload = (await response.json()) as {
    word: HskWord | null;
    current_index: number;
    previous_index: number;
    increment: number;
    words_between: HskWord[];
  };

  return {
    word: payload.word,
    state: {
      currentIndex: payload.current_index,
      previousIndex: payload.previous_index,
      increment: payload.increment,
    },
    wordsBetween: payload.words_between,
  };
}

/**
 * The most strategic HSK words (by level, then frequency) the user doesn't
 * already know, for the knowledge-base "inspiration" banner.
 */
export async function getSuggestedHskWords(): Promise<HskWord[]> {
  const response = await apiFetch(`${API_BASE}/hsk-words/suggestions`);

  if (!response.ok) {
    throw new Error("Failed to load suggested words.");
  }

  const payload = (await response.json()) as { words: HskWord[] };
  return payload.words;
}

/**
 * Ignore one or more HSK words so they're excluded from future suggestions,
 * and return the refreshed suggestion list (backfilled to keep it at the
 * same size).
 */
export async function ignoreHskWords(words: string[]): Promise<HskWord[]> {
  const response = await apiFetch(`${API_BASE}/hsk-words/ignore`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ words }),
  });

  if (!response.ok) {
    throw new Error("Failed to ignore the word(s).");
  }

  const payload = (await response.json()) as { words: HskWord[] };
  return payload.words;
}
