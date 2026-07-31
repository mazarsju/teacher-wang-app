import type { TokenUsageSummary } from "../../types/tokenUsage";
import { API_BASE } from "../apiBase";
import { apiFetch } from "../auth/apiFetch";

export async function fetchTokenUsage(): Promise<TokenUsageSummary> {
  const response = await apiFetch(`${API_BASE}/token-usage`, { method: "GET" });

  if (!response.ok) {
    throw new Error("Failed to load token usage.");
  }

  return (await response.json()) as TokenUsageSummary;
}
