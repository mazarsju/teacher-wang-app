import { API_BASE } from "../apiBase";
import { apiFetch } from "../auth/apiFetch";

export type HskLevelStatus = {
  current_level: number | null;
  next_level: number | null;
  characters_to_next_level: number | null;
  progress_to_next_level: number;
  missing_characters: string[];
  max_level: number;
  completion_ratio: number;
};

export async function fetchHskLevelStatus(): Promise<HskLevelStatus> {
  const response = await apiFetch(`${API_BASE}/hsk-level`, { method: "GET" });

  if (!response.ok) {
    throw new Error("Failed to load HSK level.");
  }

  return (await response.json()) as HskLevelStatus;
}

// Mirrors backend/utils/knowledgeBase/hsk_level.py's HSK_MAX_LEVEL.
export const HSK_MAX_LEVEL = 7;

/** Just the persisted current level — cheap, unlike `fetchHskLevelStatus`,
 * which recomputes progress/missing-characters from the full character set. */
export async function fetchHskLevelLight(): Promise<number | null> {
  const response = await apiFetch(`${API_BASE}/hsk-level-light`, { method: "GET" });

  if (!response.ok) {
    throw new Error("Failed to load HSK level.");
  }

  const data = (await response.json()) as { current_level: number | null };
  return data.current_level;
}
