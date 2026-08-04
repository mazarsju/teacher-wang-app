import { API_BASE } from "../apiBase";
import { apiFetch } from "../auth/apiFetch";

export async function deleteKnowledgeBase() {
  const response = await apiFetch(`${API_BASE}/database/knowledge-base`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error("Failed to delete knowledge base.");
  }
}

export async function exportDatabase() {
  const response = await apiFetch(`${API_BASE}/database/export`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("Failed to export database.");
  }

  const blob = await response.blob();

  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "teacher-wang-export.zip";
  a.click();

  URL.revokeObjectURL(url);
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
