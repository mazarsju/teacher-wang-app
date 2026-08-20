import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchGrammarPointDetail,
  fetchGrammarPoints,
  skipGrammarPoint,
} from "./grammarPointsApi";

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

  it("marks a grammar point as known, encoding its id in the URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await skipGrammarPoint("1|Basic Sentence Structure");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/grammar-points/1%7CBasic%20Sentence%20Structure/skip",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("throws when marking a grammar point as known fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    await expect(skipGrammarPoint("1|Basic Sentence Structure")).rejects.toThrow(
      /Failed to mark grammar point/,
    );
  });

  it("loads a grammar point's detail, encoding its id in the URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "1|Basic Sentence Structure",
        hsk_level: 1,
        title: "Basic Sentence Structure",
        prerequisites: [],
        status: "TODO",
        explanation: "# Basic Sentence Structure",
        exercises: null,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchGrammarPointDetail("1|Basic Sentence Structure"),
    ).resolves.toMatchObject({
      title: "Basic Sentence Structure",
      explanation: "# Basic Sentence Structure",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/grammar-points/1%7CBasic%20Sentence%20Structure",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("throws when loading a grammar point's detail fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    await expect(
      fetchGrammarPointDetail("1|Basic Sentence Structure"),
    ).rejects.toThrow(/Failed to load grammar topic/);
  });
});
