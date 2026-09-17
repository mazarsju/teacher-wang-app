import type { GrammarPoint, GrammarPointDetail } from "../../types/grammarPoint";
import type { CoveredGrammarPoint } from "../../types/writingSentence";
import { API_BASE } from "../apiBase";
import { apiFetch } from "../auth/apiFetch";

export type GrammarPointCatalogEntry = Pick<
  GrammarPoint,
  "id" | "hsk_level" | "index" | "title"
>;

/** Cheap catalog fields (no per-user data) for every grammar point, across
 * all HSK levels, in one call — lets the table render immediately. */
export async function fetchGrammarPointsLight(): Promise<GrammarPointCatalogEntry[]> {
  const response = await apiFetch(`${API_BASE}/grammar-points-light`, { method: "GET" });

  if (!response.ok) {
    throw new Error("Failed to load grammar points.");
  }

  const data = (await response.json()) as { grammar_points: GrammarPointCatalogEntry[] };
  if (!Array.isArray(data.grammar_points)) {
    throw new Error("Failed to load grammar points.");
  }
  return data.grammar_points;
}

export type GrammarPointLevelEntry = Pick<
  GrammarPoint,
  "id" | "prerequisites" | "status" | "score" | "usage_count"
>;

/** Per-user fields (status/score/usage_count/prerequisites) for one HSK
 * level's grammar points — call once per level instead of loading every
 * level's progress in a single request. */
export async function fetchGrammarPointsForLevel(
  hskLevel: number,
): Promise<GrammarPointLevelEntry[]> {
  const response = await apiFetch(`${API_BASE}/grammar-points/${hskLevel}`, {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error("Failed to load grammar points.");
  }

  const data = (await response.json()) as { grammar_points: GrammarPointLevelEntry[] };
  if (!Array.isArray(data.grammar_points)) {
    throw new Error("Failed to load grammar points.");
  }
  return data.grammar_points;
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

/** A grammar point whose real-life usage count (and possibly status, once it
 * flips to MASTERED) changed as a side effect of the call — lets the caller
 * patch the Redux store in place instead of refetching the whole list. */
export type GrammarPointUsageUpdate = {
  id: string;
  status: string;
  usage_count: number;
};

export type CheckGrammarPointResult = {
  grammar_points_covered: string[];
  new_grammar_points_mastered: string[];
  updated_grammar_points: GrammarPointUsageUpdate[];
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
  updated_grammar_points: GrammarPointUsageUpdate[];
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
