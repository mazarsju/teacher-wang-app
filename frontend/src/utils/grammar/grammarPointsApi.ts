import type { GrammarPoint } from "../../types/grammarPoint";
import { API_BASE } from "../apiBase";
import { apiFetch } from "../auth/apiFetch";

export async function fetchGrammarPoints(): Promise<GrammarPoint[]> {
  const response = await apiFetch(`${API_BASE}/grammar-points`, { method: "GET" });

  if (!response.ok) {
    throw new Error("Failed to load grammar points.");
  }

  return (await response.json()) as GrammarPoint[];
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
