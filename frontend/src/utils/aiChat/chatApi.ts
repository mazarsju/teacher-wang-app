import type {
  ChatHistoryResponse,
  ChatMessage,
  ChatRequest,
  ChatResponse,
  ChatThreadContext,
} from "../../types/chat";
import { API_BASE } from "../apiBase";
import { apiFetch } from "../auth/apiFetch";

export type ChatHistoryResult = {
  messages: ChatMessage[];
  completedTaskIds: string[];
};

export async function fetchChatHistory(
  characterId: string,
): Promise<ChatHistoryResult> {
  const response = await apiFetch(
    `${API_BASE}/conversation-logs/${encodeURIComponent(characterId)}`,
    { method: "GET" },
  );

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(data?.error ?? "Failed to load chat history.");
  }

  const data = (await response.json()) as ChatHistoryResponse;
  return {
    messages: data.messages,
    completedTaskIds: data.completed_task_ids ?? [],
  };
}

export async function sendChatMessage(
  characterId: string,
  messages: ChatMessage[],
  thread?: ChatThreadContext,
): Promise<ChatResponse> {
  const body: ChatRequest = {
    character_id: characterId,
    messages: messages.map(({ role, content }) => ({ role, content })),
  };

  if (thread) {
    body.parent_character_id = thread.parentCharacterId;
    body.thread_id = thread.threadId;
  }

  const response = await apiFetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(data?.error ?? "Failed to send chat message.");
  }

  return (await response.json()) as ChatResponse;
}

export async function clearChatHistory(characterId: string): Promise<void> {
  const response = await apiFetch(
    `${API_BASE}/conversation-logs/${encodeURIComponent(characterId)}`,
    { method: "DELETE" },
  );

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(data?.error ?? "Failed to clear chat history.");
  }
}
