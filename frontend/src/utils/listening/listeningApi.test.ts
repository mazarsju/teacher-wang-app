import { fetchListeningPractices, refreshListeningPractices } from "./listeningApi";

describe("listeningApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads the listening practices list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            listening_practices: [
              {
                id: "listening-family-size",
                title: "How many are in your family?",
                hsk_level: 1,
                status: "TODO",
                vocabulary_score: 0,
                grammar_score: 0,
              },
            ],
          }),
        }),
      ),
    );

    await expect(fetchListeningPractices()).resolves.toEqual([
      {
        id: "listening-family-size",
        title: "How many are in your family?",
        hsk_level: 1,
        status: "TODO",
        vocabulary_score: 0,
        grammar_score: 0,
      },
    ]);
  });

  it("throws when loading listening practices fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false, json: async () => ({}) })),
    );

    await expect(fetchListeningPractices()).rejects.toThrow(
      "Failed to load listening practices.",
    );
  });

  it("refreshes listening practices", async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(refreshListeningPractices()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/listening-practices/refresh",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("throws when refreshing listening practices fails", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false })));

    await expect(refreshListeningPractices()).rejects.toThrow(
      "Failed to refresh listening practices.",
    );
  });
});
