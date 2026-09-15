import type {
  CompleteListeningPracticeResult,
  ListeningPracticeDetail,
  ListeningPracticesResult,
  ListeningProgressData,
} from "../../types/listeningPractice";
import { API_BASE } from "../apiBase";
import { apiFetch } from "../auth/apiFetch";

export async function fetchListeningPractices(): Promise<ListeningPracticesResult> {
  const response = await apiFetch(`${API_BASE}/listening-practices`, {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error("Failed to load listening practices.");
  }

  const data = (await response.json()) as {
    listening_practices: ListeningPracticesResult["practices"];
    current_hsk_level: number;
  };
  return { practices: data.listening_practices, currentHskLevel: data.current_hsk_level };
}

export async function refreshListeningPractices(): Promise<void> {
  const response = await apiFetch(`${API_BASE}/listening-practices/refresh`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("Failed to refresh listening practices.");
  }
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

export async function transcribeListeningAudio(audio: Blob): Promise<string> {
  const formData = new FormData();
  formData.append("audio", audio, "recording.webm");

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
