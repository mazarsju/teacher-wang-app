import type { TokenUsageSummary } from "../../types/tokenUsage";

export async function fetchTokenUsage(): Promise<TokenUsageSummary> {
  const response = await fetch("/token-usage", { method: "GET" });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(data?.error ?? "Failed to load token usage.");
  }

  return (await response.json()) as TokenUsageSummary;
}
