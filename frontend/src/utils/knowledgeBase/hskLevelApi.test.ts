import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchHskLevelStatus } from "./hskLevelApi";

describe("hskLevelApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads HSK level status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          current_level: 1,
          next_level: 2,
          characters_to_next_level: 10,
          progress_to_next_level: 0.5,
          missing_characters: ["爱"],
          max_level: 6,
          completion_ratio: 0.1,
        }),
      }),
    );

    await expect(fetchHskLevelStatus()).resolves.toMatchObject({
      current_level: 1,
      next_level: 2,
    });
  });

  it("throws when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false }),
    );

    await expect(fetchHskLevelStatus()).rejects.toThrow(/Failed to load HSK/);
  });
});
