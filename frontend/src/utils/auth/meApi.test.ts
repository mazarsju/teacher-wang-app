import { fetchCurrentUser, updateUserLanguage } from "./meApi";

describe("meApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads the current user", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            sub: "abc",
            username: "learner",
            email: "learner@example.com",
            plan: "free",
            language: "en",
            is_admin: false,
          }),
        }),
      ),
    );

    await expect(fetchCurrentUser()).resolves.toEqual({
      sub: "abc",
      username: "learner",
      email: "learner@example.com",
      plan: "free",
      language: "en",
      is_admin: false,
    });
  });

  it("throws when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false, json: async () => ({}) })),
    );

    await expect(fetchCurrentUser()).rejects.toThrow(
      "Failed to load current user.",
    );
  });

  it("updates the language preference", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, json: async () => ({ language: "fr" }) }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(updateUserLanguage("fr")).resolves.toBeUndefined();
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/preferences/language");
    expect(options).toMatchObject({
      method: "PATCH",
      body: JSON.stringify({ language: "fr" }),
    });
  });

  it("throws when updating the language preference fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false, json: async () => ({}) })),
    );

    await expect(updateUserLanguage("fr")).rejects.toThrow(
      "Failed to update the language preference.",
    );
  });
});
