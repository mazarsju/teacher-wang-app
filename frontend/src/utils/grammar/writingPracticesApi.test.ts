import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWritingPractices } from "./writingPracticesApi";

describe("writingPracticesApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads writing practices", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          writing_practices: [
            {
              id: "writing-present-yourself",
              title: "Present yourself",
              after_grammar_point: "1|Basic Sentence Structure",
              status: "TODO",
            },
          ],
        }),
      }),
    );

    await expect(fetchWritingPractices()).resolves.toEqual([
      {
        id: "writing-present-yourself",
        title: "Present yourself",
        after_grammar_point: "1|Basic Sentence Structure",
        status: "TODO",
      },
    ]);
  });

  it("throws when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    await expect(fetchWritingPractices()).rejects.toThrow(/Failed to load writing/);
  });

  it("throws when the response body isn't the expected shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ writing_practices: {} }) }),
    );

    await expect(fetchWritingPractices()).rejects.toThrow(/Failed to load writing/);
  });
});
