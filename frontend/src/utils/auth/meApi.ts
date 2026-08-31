import { API_BASE } from "../apiBase";
import { apiFetch } from "./apiFetch";

export type CurrentUser = {
  sub: string;
  username: string;
  email: string;
  plan: string;
  language: string;
  is_admin: boolean;
};

export async function fetchCurrentUser(): Promise<CurrentUser> {
  const response = await apiFetch(`${API_BASE}/auth/me`, { method: "GET" });

  if (!response.ok) {
    throw new Error("Failed to load current user.");
  }

  return (await response.json()) as CurrentUser;
}

export async function updateUserLanguage(language: string): Promise<void> {
  const response = await apiFetch(`${API_BASE}/preferences/language`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ language }),
  });

  if (!response.ok) {
    throw new Error("Failed to update the language preference.");
  }
}
