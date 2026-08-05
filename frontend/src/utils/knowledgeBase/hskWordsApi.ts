import type { HskWord } from "../../types/hskWord";
import { API_BASE } from "../apiBase";
import { apiFetch } from "../auth/apiFetch";

export async function pickNextHskWord(
  excludeWords: string[] = [],
): Promise<HskWord | null> {
  const query =
    excludeWords.length > 0
      ? `?exclude=${encodeURIComponent(excludeWords.join(","))}`
      : "";
  const response = await apiFetch(`${API_BASE}/hsk-words/next${query}`, {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error("Failed to pick the next word.");
  }

  const payload = (await response.json()) as { word: HskWord | null };
  return payload.word;
}
