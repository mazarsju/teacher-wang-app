import { API_BASE } from "../apiBase";
import { apiFetch } from "./apiFetch";

async function throwOnError(response: Response): Promise<void> {
  if (response.ok) {
    return;
  }
  const body = await response.json().catch(() => ({}) as { error?: string });
  throw new Error(body.error ?? "Something went wrong. Please try again.");
}

/** Ask the backend to email a Cognito password-reset code, if the account exists. */
export async function requestPasswordReset(email: string): Promise<void> {
  const response = await apiFetch(`${API_BASE}/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  await throwOnError(response);
}

/** Confirm the emailed code and set a new password. */
export async function confirmPasswordReset(
  email: string,
  code: string,
  newPassword: string,
): Promise<void> {
  const response = await apiFetch(`${API_BASE}/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code, newPassword }),
  });
  await throwOnError(response);
}
