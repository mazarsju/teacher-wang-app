import type { GrammarSeverity } from "../../types/chat";
import { API_BASE } from "../apiBase";
import { apiFetch } from "../auth/apiFetch";

export type WritingSentenceCorrection = {
  severity: GrammarSeverity;
  answer?: string;
};

export async function checkWritingSentence(
  text: string,
): Promise<WritingSentenceCorrection> {
  const response = await apiFetch(`${API_BASE}/writing/check-sentence`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    throw new Error("Failed to check this sentence's grammar.");
  }

  return (await response.json()) as WritingSentenceCorrection;
}

export type WritingDraft = {
  draft: string;
  archive: unknown[];
};

export async function fetchWritingDraft(topicId: string): Promise<WritingDraft> {
  const response = await apiFetch(
    `${API_BASE}/writing/draft/${encodeURIComponent(topicId)}`,
    { method: "GET" },
  );

  if (!response.ok) {
    throw new Error("Failed to load your saved draft.");
  }

  return (await response.json()) as WritingDraft;
}

export async function saveWritingDraft(
  topicId: string,
  draft: string,
): Promise<WritingDraft> {
  const response = await apiFetch(
    `${API_BASE}/writing/draft/${encodeURIComponent(topicId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft }),
    },
  );

  if (!response.ok) {
    throw new Error("Failed to save your draft.");
  }

  return (await response.json()) as WritingDraft;
}
