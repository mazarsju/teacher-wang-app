import { API_BASE } from "../apiBase";
import { apiFetch } from "../auth/apiFetch";

export async function exportDatabase() {
  const response = await apiFetch(`${API_BASE}/database/export`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("Failed to export database.");
  }

  return (await response.json()) as { message: string; filename: string };
}

export async function importDatabase(file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await apiFetch(`${API_BASE}/characters/bulk`, {
    method: "POST",
    body: formData,
  });

  const payload = (await response.json()) as { message?: string; error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? "Failed to import database.");
  }

  return payload;
}
