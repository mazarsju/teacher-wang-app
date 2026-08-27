import type { GrammarSeverity } from "./chat";

export type WritingSentenceCheckStatus = "pending" | "checking" | "done" | "error";

export type CoveredGrammarPoint = {
  id: string;
  title: string;
};

/**
 * One sentence from the user's draft, with its grammar-check progress. The
 * severity/answer/grammarPointsCovered fields are what's shown today;
 * kept as a per-sentence object so a future step can do more with each one.
 *
 * grammarPointsCovered is only detected, not yet recorded — the usage is
 * only sent to the backend once the whole text is fully correct, so a
 * point doesn't get "credit" for a draft that still has mistakes.
 */
export type WritingSentenceCheck = {
  id: string;
  paragraphIndex: number;
  text: string;
  status: WritingSentenceCheckStatus;
  severity: GrammarSeverity | null;
  answer: string | null;
  grammarPointsCovered: CoveredGrammarPoint[];
};
