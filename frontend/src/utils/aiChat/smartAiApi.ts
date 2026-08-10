import type { SmartAiPreference } from "../../types/smartAi";
import { API_BASE } from "../apiBase";
import { apiFetch } from "../auth/apiFetch";

export async function fetchSmartAiPreference(): Promise<SmartAiPreference> {
  const response = await apiFetch(`${API_BASE}/preferences/smart-ai`, {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error("Failed to load the Smart AI preference.");
  }

  return (await response.json()) as SmartAiPreference;
}

export async function updateSmartAiPreference(
  enabled: boolean,
): Promise<SmartAiPreference> {
  const response = await apiFetch(`${API_BASE}/preferences/smart-ai`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });

  if (!response.ok) {
    throw new Error("Failed to update the Smart AI preference.");
  }

  return (await response.json()) as SmartAiPreference;
}
