import type {
  CompleteListeningPracticeResult,
  ListeningPracticeCatalogEntry,
  ListeningPracticeDetail,
  ListeningPracticeLevelEntry,
  ListeningProgressData,
} from "../../types/listeningPractice";
import { API_BASE } from "../apiBase";
import { apiFetch } from "../auth/apiFetch";

/** Cheap catalog fields (no per-user data) for every listening topic up to
 * `maxHskLevel` (omit to get every level), in one call — mirrors GET
 * /grammar-points-light, but scoped by level since the caller already knows
 * the achieved level (from GET /hsk-level-light) by the time this runs. */
export async function fetchListeningPracticesLight(
  maxHskLevel?: number,
): Promise<ListeningPracticeCatalogEntry[]> {
  const query = maxHskLevel === undefined ? "" : `?max_hsk_level=${maxHskLevel}`;
  const response = await apiFetch(`${API_BASE}/listening-practices-light${query}`, {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error("Failed to load listening practices.");
  }

  const data = (await response.json()) as {
    listening_practices: ListeningPracticeCatalogEntry[];
  };
  return data.listening_practices;
}

/** Per-user fields (status/vocabulary_score/grammar_score) for one HSK
 * level's listening topics, recomputed fresh on every call — mirrors GET
 * /grammar-points/<hsk_level>. Call once per visible level instead of
 * refreshing every level in a single request. */
export async function fetchListeningPracticesForLevel(
  hskLevel: number,
): Promise<ListeningPracticeLevelEntry[]> {
  const response = await apiFetch(`${API_BASE}/listening-practices/${hskLevel}`, {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error("Failed to load listening practices.");
  }

  const data = (await response.json()) as {
    listening_practices: ListeningPracticeLevelEntry[];
  };
  return data.listening_practices;
}

export async function fetchListeningPracticeDetail(
  id: string,
): Promise<ListeningPracticeDetail> {
  const response = await apiFetch(
    `${API_BASE}/listening-practices/${encodeURIComponent(id)}`,
    { method: "GET" },
  );

  if (!response.ok) {
    throw new Error("Failed to load the listening practice.");
  }

  return (await response.json()) as ListeningPracticeDetail;
}

export async function fetchListeningAudioBlob(id: string): Promise<Blob> {
  const response = await apiFetch(
    `${API_BASE}/listening-practices/${encodeURIComponent(id)}/audio`,
    { method: "GET" },
  );

  if (!response.ok) {
    throw new Error("Failed to load the audio.");
  }

  return response.blob();
}

export async function fetchListeningAudioSegmentBlob(
  id: string,
  segment: number,
  chunk?: number,
): Promise<Blob> {
  const path = chunk === undefined ? `${segment}` : `${segment}/${chunk}`;
  const response = await apiFetch(
    `${API_BASE}/listening-practices/${encodeURIComponent(id)}/audio/${path}`,
    { method: "GET" },
  );

  if (!response.ok) {
    throw new Error("Failed to load the audio.");
  }

  return response.blob();
}

export async function completeListeningPractice(
  id: string,
  completed: boolean,
): Promise<CompleteListeningPracticeResult> {
  const response = await apiFetch(
    `${API_BASE}/listening-practices/${encodeURIComponent(id)}/complete`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed }),
    },
  );

  if (!response.ok) {
    throw new Error("Failed to save the completion status.");
  }

  return (await response.json()) as CompleteListeningPracticeResult;
}

/** Saves the learner's Questions/Shadowing/Bonus answers wholesale — called
 * on every Verify/Check/Submit click, not on every keystroke. Best-effort:
 * callers swallow failures rather than surfacing a save error to the learner. */
export async function saveListeningProgress(
  id: string,
  progress: ListeningProgressData,
): Promise<void> {
  const response = await apiFetch(
    `${API_BASE}/listening-practices/${encodeURIComponent(id)}/progress`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ progress }),
    },
  );

  if (!response.ok) {
    throw new Error("Failed to save your progress.");
  }
}

export async function transcribeListeningAudio(
  audio: Blob,
  expectedText?: string,
): Promise<string> {
  const formData = new FormData();
  formData.append("audio", audio, "recording.webm");
  if (expectedText) {
    formData.append("expected_text", expectedText);
  }

  const response = await apiFetch(`${API_BASE}/chat/stt`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(data?.error ?? "Failed to transcribe audio.");
  }

  const data = (await response.json()) as { text: string };
  return data.text;
}
