import type { ChallengeProgressSummary } from "../../types/challenge";

export async function fetchChallengesProgress(): Promise<ChallengeProgressSummary> {
  const response = await fetch("/challenges/progress", { method: "GET" });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(data?.error ?? "Failed to load challenges progress.");
  }

  return (await response.json()) as ChallengeProgressSummary;
}
