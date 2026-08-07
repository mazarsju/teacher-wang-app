import type { HskCharacter } from "../../types/hskCharacter";
import { API_BASE } from "../apiBase";
import { apiFetch } from "../auth/apiFetch";

export async function fetchHskCharacters(): Promise<HskCharacter[]> {
  const response = await apiFetch(`${API_BASE}/hsk-characters`, { method: "GET" });

  if (!response.ok) {
    throw new Error("Failed to load HSK characters.");
  }

  return (await response.json()) as HskCharacter[];
}
