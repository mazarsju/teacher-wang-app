import type { TokenUsageSummary } from "../../types/tokenUsage";
import { API_BASE } from "../apiBase";

export async function fetchTokenUsage(): Promise<TokenUsageSummary> {
  const response = await fetch(`${API_BASE}/token-usage`, { method: "GET" });

  if (!response.ok) {
    throw new Error("Failed to load token usage.");
  }

  return (await response.json()) as TokenUsageSummary;
}
