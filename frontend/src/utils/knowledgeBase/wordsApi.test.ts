import { bulkCreateWords } from "./wordsApi";

describe("bulkCreateWords", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the words list and returns the created words", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          words: [{ word: "爱好", definition: "hobby", characters: ["爱", "好"] }],
        }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const values = [{ word: "爱好", definition: "hobby" }];
    await expect(bulkCreateWords(values)).resolves.toEqual([
      { word: "爱好", definition: "hobby", characters: ["爱", "好"] },
    ]);

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body as string)).toEqual({ words: values });
  });

  it("throws when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          json: async () => ({ error: "Word already exists" }),
        }),
      ),
    );

    await expect(
      bulkCreateWords([{ word: "爱好", definition: null }]),
    ).rejects.toThrow("Failed to add words.");
  });
});
