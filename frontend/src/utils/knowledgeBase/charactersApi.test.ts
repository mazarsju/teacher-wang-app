import { bulkCreateCharacters } from "./charactersApi";

describe("bulkCreateCharacters", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the characters list and returns the created characters", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          characters: [{ char: "爱", pinyin: "ai4", writing_known: true }],
        }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const values = [{ char: "爱", pinyin: "ai4", writing_known: true }];
    await expect(bulkCreateCharacters(values)).resolves.toEqual([
      { char: "爱", pinyin: "ai4", writing_known: true },
    ]);

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body as string)).toEqual({ characters: values });
  });

  it("throws when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          json: async () => ({ error: "Character already exists" }),
        }),
      ),
    );

    await expect(
      bulkCreateCharacters([{ char: "爱", pinyin: "ai4", writing_known: true }]),
    ).rejects.toThrow("Failed to add characters.");
  });
});
