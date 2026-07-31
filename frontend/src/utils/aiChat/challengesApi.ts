import type { ChallengeProgressSummary } from "../../types/challenge";
import { API_BASE } from "../apiBase";
import { apiFetch } from "../auth/apiFetch";

export async function fetchChallengesProgress(): Promise<ChallengeProgressSummary> {
  const response = await apiFetch(`${API_BASE}/challenges/progress`, {
    method: "GET",
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(data?.error ?? "Failed to load challenges progress.");
  }

  return (await response.json()) as ChallengeProgressSummary;
}
