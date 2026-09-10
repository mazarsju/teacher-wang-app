import type { ChatSetupPreference } from "../../types/chatSetupPreference";
import { API_BASE } from "../apiBase";
import { apiFetch } from "../auth/apiFetch";

export async function fetchChatSetupPreference(): Promise<ChatSetupPreference> {
  const response = await apiFetch(`${API_BASE}/preferences/chat-setup`, {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error("Failed to load the chat setup preference.");
  }

  return (await response.json()) as ChatSetupPreference;
}

export async function updateChatSetupPreference(
  update: Partial<ChatSetupPreference>,
): Promise<ChatSetupPreference> {
  const response = await apiFetch(`${API_BASE}/preferences/chat-setup`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(update),
  });

  if (!response.ok) {
    throw new Error("Failed to update the chat setup preference.");
  }

  return (await response.json()) as ChatSetupPreference;
}
