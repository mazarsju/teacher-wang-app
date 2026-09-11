import type {
  ListeningPractice,
  ListeningPracticeDetail,
} from "../../types/listeningPractice";
import { API_BASE } from "../apiBase";
import { apiFetch } from "../auth/apiFetch";

export async function fetchListeningPractices(): Promise<ListeningPractice[]> {
  const response = await apiFetch(`${API_BASE}/listening-practices`, {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error("Failed to load listening practices.");
  }

  const data = (await response.json()) as {
    listening_practices: ListeningPractice[];
  };
  return data.listening_practices;
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
): Promise<Blob> {
  const response = await apiFetch(
    `${API_BASE}/listening-practices/${encodeURIComponent(id)}/audio/${segment}`,
    { method: "GET" },
  );

  if (!response.ok) {
    throw new Error("Failed to load the audio.");
  }

  return response.blob();
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
