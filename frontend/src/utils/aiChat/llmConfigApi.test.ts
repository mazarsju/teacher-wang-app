import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLlmConfig, saveLlmConfig } from "./llmConfigApi";

describe("llmConfigApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches LLM configuration", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          LLM_API_KEY: "key",
          LLM_MODEL: "gpt-4o-mini",
        }),
      }),
    );

    await expect(fetchLlmConfig()).resolves.toEqual({
      LLM_API_KEY: "key",
      LLM_MODEL: "gpt-4o-mini",
    });
  });

  it("saves LLM configuration", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          LLM_API_KEY: "new",
          LLM_MODEL: "gpt-4o",
        }),
      }),
    );

    await expect(
      saveLlmConfig({ LLM_API_KEY: "new", LLM_MODEL: "gpt-4o" }),
    ).resolves.toEqual({
      LLM_API_KEY: "new",
      LLM_MODEL: "gpt-4o",
    });
  });

  it("surfaces backend errors when saving fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "invalid model" }),
      }),
    );

    await expect(
      saveLlmConfig({ LLM_API_KEY: "x", LLM_MODEL: "bad" }),
    ).rejects.toThrow("invalid model");
  });
});
