import type { AdminUser, UserPlan } from "../../types/adminUser";
import { API_BASE } from "../apiBase";
import { apiFetch } from "../auth/apiFetch";

export async function fetchUsers(): Promise<AdminUser[]> {
  const response = await apiFetch(`${API_BASE}/admin/users`, { method: "GET" });

  if (!response.ok) {
    throw new Error("Failed to load users.");
  }

  const payload = (await response.json()) as { users: AdminUser[] };
  return payload.users;
}

export async function updateUserPlan(
  id: string,
  plan: UserPlan,
): Promise<AdminUser> {
  const response = await apiFetch(`${API_BASE}/admin/users/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan }),
  });

  if (!response.ok) {
    throw new Error("Failed to update user.");
  }

  return (await response.json()) as AdminUser;
}

export async function deleteUser(id: string): Promise<void> {
  const response = await apiFetch(`${API_BASE}/admin/users/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error("Failed to delete user.");
  }
}

export async function reloadHskContent(): Promise<void> {
  const response = await apiFetch(`${API_BASE}/admin/hsk/reload`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("Failed to reload the HSK database.");
  }
}

export async function generateArticles(): Promise<void> {
  const response = await apiFetch(`${API_BASE}/admin/articles/generate`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("Failed to refresh articles.");
  }
}

export async function reloadGrammarRules(): Promise<void> {
  const response = await apiFetch(`${API_BASE}/admin/grammar/reload`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("Failed to reload grammar rules.");
  }
}

export async function reloadListeningPractice(): Promise<void> {
  const response = await apiFetch(`${API_BASE}/admin/listening/reload`, {
    method: "POST",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(payload?.error || "Failed to reload listening practice.");
  }
}

export async function uploadHskTranslation(
  file: File,
  language: string,
): Promise<void> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("language", language);

  const response = await apiFetch(`${API_BASE}/admin/hsk/translation`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error("Failed to load HSK translations.");
  }
}
