import type { LlmConfig } from "../../types/llmConfig";

export async function fetchLlmConfig(): Promise<LlmConfig> {
  const response = await fetch("/llm-config", { method: "GET" });

  if (!response.ok) {
    throw new Error("Failed to load LLM configuration.");
  }

  return (await response.json()) as LlmConfig;
}

export async function saveLlmConfig(config: LlmConfig): Promise<LlmConfig> {
  const response = await fetch("/llm-config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(data?.error ?? "Failed to save LLM configuration.");
  }

  return (await response.json()) as LlmConfig;
}
