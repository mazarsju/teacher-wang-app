import { API_BASE } from "../apiBase";
import { apiFetch } from "./apiFetch";

export type CurrentUser = {
  sub: string;
  username: string;
  email: string;
  plan: string;
  is_admin: boolean;
};

export async function fetchCurrentUser(): Promise<CurrentUser> {
  const response = await apiFetch(`${API_BASE}/auth/me`, { method: "GET" });

  if (!response.ok) {
    throw new Error("Failed to load current user.");
  }

  return (await response.json()) as CurrentUser;
}
