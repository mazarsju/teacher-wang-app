import { fetchCurrentUser } from "./meApi";

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
});
