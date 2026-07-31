import type { Word } from "../../types/word";
import { API_BASE } from "../apiBase";
import { apiFetch } from "../auth/apiFetch";

export async function fetchWords(limit?: number): Promise<Word[]> {
  const query = limit == null ? "" : `?limit=${limit}`;
  const response = await apiFetch(`${API_BASE}/words${query}`, {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error("Failed to load words.");
  }

  return (await response.json()) as Word[];
}

export async function createWord(values: {
  word: string;
  definition: string | null;
}): Promise<Word> {
  const response = await apiFetch(`${API_BASE}/words`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  });

  if (!response.ok) {
    throw new Error("Failed to add word.");
  }

  return (await response.json()) as Word;
}

export async function updateWord(
  word: string,
  values: { definition: string | null },
): Promise<Word> {
  const response = await apiFetch(
    `${API_BASE}/words/${encodeURIComponent(word)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    },
  );

  if (!response.ok) {
    throw new Error("Failed to update word.");
  }

  return (await response.json()) as Word;
}

export async function deleteWord(word: string): Promise<void> {
  const response = await apiFetch(
    `${API_BASE}/words/${encodeURIComponent(word)}`,
    { method: "DELETE" },
  );

  if (!response.ok) {
    throw new Error("Failed to delete word.");
  }
}
