import type { Character } from "../../types/character";
import { API_BASE } from "../apiBase";
import { apiFetch } from "../auth/apiFetch";

export async function fetchCharacters(limit?: number): Promise<Character[]> {
  const query = limit == null ? "" : `?limit=${limit}`;
  const response = await apiFetch(`${API_BASE}/characters${query}`, {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error("Failed to load characters.");
  }

  return (await response.json()) as Character[];
}

export async function bulkCreateCharacters(
  values: { char: string; pinyin: string; writting_known: boolean }[],
): Promise<Character[]> {
  const response = await apiFetch(`${API_BASE}/characters/bulk-create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ characters: values }),
  });

  if (!response.ok) {
    throw new Error("Failed to add characters.");
  }

  const payload = (await response.json()) as { characters: Character[] };
  return payload.characters;
}
