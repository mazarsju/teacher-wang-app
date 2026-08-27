import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkGrammarPoint,
  fetchGrammarPointDetail,
  fetchGrammarPoints,
  skipGrammarPoint,
} from "./grammarPointsApi";

describe("grammarPointsApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads grammar points and writing practices", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          grammar_points: [
            {
              id: "1|Basic Sentence Structure",
              hsk_level: 1,
              title: "Basic Sentence Structure",
              prerequisites: [],
              status: "TODO",
            },
          ],
          writing_practices: [
            {
              id: "writing-present-yourself",
              title: "Present yourself",
              after_grammar_point: "1|Basic Sentence Structure",
            },
          ],
        }),
      }),
    );

    await expect(fetchGrammarPoints()).resolves.toMatchObject({
      grammarPoints: [{ id: "1|Basic Sentence Structure", hsk_level: 1 }],
      writingPractices: [{ id: "writing-present-yourself", title: "Present yourself" }],
    });
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

  it("checks grammar point usage in a text, sending it in the JSON body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        grammar_points_covered: ["Ba construction"],
        new_grammar_points_mastered: [],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkGrammarPoint("我把书放下了")).resolves.toEqual({
      grammar_points_covered: ["Ba construction"],
      new_grammar_points_mastered: [],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/grammar-points/check",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ text: "我把书放下了" }),
      }),
    );
  });

  it("throws when checking grammar point usage fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    await expect(checkGrammarPoint("我把书放下了")).rejects.toThrow(
      /Failed to check grammar point usage/,
    );
  });
});
