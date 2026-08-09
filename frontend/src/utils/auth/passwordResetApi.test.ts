import { confirmPasswordReset, requestPasswordReset } from "./passwordResetApi";

describe("passwordResetApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests a reset code for the given email", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, json: async () => ({ message: "sent" }) }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestPasswordReset("learner@example.com")).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/auth/forgot-password");
    expect(JSON.parse(init.body as string)).toEqual({ email: "learner@example.com" });
  });

  it("surfaces the backend error message when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({ ok: false, json: async () => ({ error: "email is required" }) }),
      ),
    );

    await expect(requestPasswordReset("")).rejects.toThrow("email is required");
  });

  it("falls back to a generic message when the error body has no message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false, json: async () => ({}) })),
    );

    await expect(requestPasswordReset("learner@example.com")).rejects.toThrow(
      "Something went wrong. Please try again.",
    );
  });

  it("confirms a password reset with the code and new password", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, json: async () => ({ message: "updated" }) }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      confirmPasswordReset("learner@example.com", "123456", "NewPass1!"),
    ).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/auth/reset-password");
    expect(JSON.parse(init.body as string)).toEqual({
      email: "learner@example.com",
      code: "123456",
      newPassword: "NewPass1!",
    });
  });

  it("surfaces invalid-code errors from the backend", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({ ok: false, json: async () => ({ error: "Invalid code." }) }),
      ),
    );

    await expect(
      confirmPasswordReset("learner@example.com", "000000", "NewPass1!"),
    ).rejects.toThrow("Invalid code.");
  });
});
