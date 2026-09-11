import type { ListeningPractice } from "../../types/listeningPractice";
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
