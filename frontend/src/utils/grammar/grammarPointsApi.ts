import type { GrammarPoint, GrammarPointDetail } from "../../types/grammarPoint";
import type { CoveredGrammarPoint } from "../../types/writingSentence";
import { API_BASE } from "../apiBase";
import { apiFetch } from "../auth/apiFetch";

export async function fetchGrammarPoints(): Promise<GrammarPoint[]> {
  const response = await apiFetch(`${API_BASE}/grammar-points`, { method: "GET" });

  if (!response.ok) {
    throw new Error("Failed to load grammar points.");
  }

  return (await response.json()) as GrammarPoint[];
}

export async function fetchGrammarPointDetail(
  grammarId: string,
): Promise<GrammarPointDetail> {
  const response = await apiFetch(
    `${API_BASE}/grammar-points/${encodeURIComponent(grammarId)}`,
    { method: "GET" },
  );

  if (!response.ok) {
    throw new Error("Failed to load grammar topic.");
  }

  return (await response.json()) as GrammarPointDetail;
}

export async function skipGrammarPoint(grammarId: string): Promise<void> {
  const response = await apiFetch(
    `${API_BASE}/grammar-points/${encodeURIComponent(grammarId)}/skip`,
    { method: "POST" },
  );

  if (!response.ok) {
    throw new Error("Failed to mark grammar point as known.");
  }
}

export type CheckGrammarPointResult = {
  grammar_points_covered: string[];
  new_grammar_points_mastered: string[];
};

export async function checkGrammarPoint(text: string): Promise<CheckGrammarPointResult> {
  const response = await apiFetch(`${API_BASE}/grammar-points/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    throw new Error("Failed to check grammar point usage.");
  }

  return (await response.json()) as CheckGrammarPointResult;
}

/** Detects which mastered-in-progress grammar points `text` uses, without
 * recording any usage. Pair with `recordGrammarUsage` once the usage should
 * actually count. */
export async function detectGrammarPoints(text: string): Promise<CoveredGrammarPoint[]> {
  const response = await apiFetch(`${API_BASE}/grammar-points/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, check_only: true }),
  });

  if (!response.ok) {
    throw new Error("Failed to detect grammar point usage.");
  }

  const data = (await response.json()) as { grammar_points_covered: CoveredGrammarPoint[] };
  return data.grammar_points_covered;
}

export type RecordGrammarUsageResult = {
  new_grammar_points_mastered: string[];
};

/** `grammarIds` has one entry per usage (a point used in 3 sentences appears 3 times). */
export async function recordGrammarUsage(
  grammarIds: string[],
): Promise<RecordGrammarUsageResult> {
  const response = await apiFetch(`${API_BASE}/grammar-points/record-usage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grammar_ids: grammarIds }),
  });

  if (!response.ok) {
    throw new Error("Failed to record grammar point usage.");
  }

  return (await response.json()) as RecordGrammarUsageResult;
}

export async function completeGrammarPoint(
  grammarId: string,
  score: number,
): Promise<void> {
  const response = await apiFetch(
    `${API_BASE}/grammar-points/${encodeURIComponent(grammarId)}/complete`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score }),
    },
  );

  if (!response.ok) {
    throw new Error("Failed to save the quiz result.");
  }
}
