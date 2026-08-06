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
