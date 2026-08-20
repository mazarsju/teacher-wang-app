import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchGrammarPoints } from "./grammarPointsApi";

describe("grammarPointsApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads grammar points", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            id: "1|Basic Sentence Structure",
            hsk_level: 1,
            title: "Basic Sentence Structure",
            prerequisites: [],
            status: "TODO",
          },
        ],
      }),
    );

    await expect(fetchGrammarPoints()).resolves.toMatchObject([
      { id: "1|Basic Sentence Structure", hsk_level: 1 },
    ]);
  });

  it("throws when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    await expect(fetchGrammarPoints()).rejects.toThrow(/Failed to load grammar/);
  });
});
