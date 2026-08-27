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

export async function checkWritingTopicRelevance(
  text: string,
  topic: string,
): Promise<boolean> {
  const response = await apiFetch(`${API_BASE}/writing/check-topic-relevance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, topic }),
  });

  if (!response.ok) {
    throw new Error("Failed to check whether the text answers the topic.");
  }

  const data = (await response.json()) as { on_topic: boolean };
  return data.on_topic;
}

export type WritingArchiveEntry = {
  timestamp: string;
  content: string;
};

export type WritingPracticeDetail = {
  title: string;
  context: string | null;
  draft: string;
  archive: WritingArchiveEntry[];
};

/** Fetches everything about one writing-practice topic: its title and
 * prompt (`context`, from S3) plus the learner's saved `draft` and
 * `archive` of past fully-correct submissions (Postgres + the
 * conversation-logs S3 bucket). */
export async function fetchWritingPractice(
  topicId: string,
): Promise<WritingPracticeDetail> {
  const response = await apiFetch(
    `${API_BASE}/writing-practice/${encodeURIComponent(topicId)}`,
    { method: "GET" },
  );

  if (!response.ok) {
    throw new Error("Failed to load this writing practice topic.");
  }

  return (await response.json()) as WritingPracticeDetail;
}

export type WritingDraft = {
  draft: string;
  archive: WritingArchiveEntry[];
};

export async function saveWritingDraft(
  topicId: string,
  draft: string,
): Promise<WritingDraft> {
  const response = await apiFetch(
    `${API_BASE}/writing-practice/${encodeURIComponent(topicId)}`,
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

export async function completeWritingDraft(
  topicId: string,
  draft: string,
): Promise<WritingDraft> {
  const response = await apiFetch(
    `${API_BASE}/writing-practice/${encodeURIComponent(topicId)}/complete`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft }),
    },
  );

  if (!response.ok) {
    throw new Error("Failed to archive the completed text.");
  }

  return (await response.json()) as WritingDraft;
}
