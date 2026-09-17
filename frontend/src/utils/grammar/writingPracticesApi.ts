import type { WritingTopic } from "../../types/writingTopic";
import { API_BASE } from "../apiBase";
import { apiFetch } from "../auth/apiFetch";

export async function fetchWritingPractices(): Promise<WritingTopic[]> {
  const response = await apiFetch(`${API_BASE}/writing-practices`, { method: "GET" });

  if (!response.ok) {
    throw new Error("Failed to load writing practices.");
  }

  const data = (await response.json()) as { writing_practices: WritingTopic[] };
  if (!Array.isArray(data.writing_practices)) {
    throw new Error("Failed to load writing practices.");
  }
  return data.writing_practices;
}
