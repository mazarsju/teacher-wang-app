import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ID_TOKEN_HEADER,
  apiFetch,
  authHeaders,
  onUnauthorizedSession,
} from "./apiFetch";
import {
  clearCognitoTokens,
  getStoredAccessToken,
  storeCognitoTokens,
} from "./tokenStorage";

function headersOf(fetchMock: ReturnType<typeof vi.fn>): Headers {
  return new Headers(fetchMock.mock.calls[0][1].headers);
}

describe("apiFetch", () => {
  afterEach(() => {
    const unsubscribe = onUnauthorizedSession(() => {});
    unsubscribe();
    vi.unstubAllGlobals();
    clearCognitoTokens();
  });

  it("returns no headers without a stored session", () => {
    expect(authHeaders()).toEqual({});
  });

  it("sends the access token and the id token companion header", async () => {
    storeCognitoTokens({
      accessToken: "access-token",
      idToken: "id-token",
      refreshToken: "refresh-token",
    });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/api/characters", { method: "GET" });

    const headers = headersOf(fetchMock);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/characters");
    expect(headers.get("Authorization")).toBe("Bearer access-token");
    expect(headers.get(ID_TOKEN_HEADER)).toBe("id-token");
  });

  it("keeps caller headers and does not overwrite an explicit Authorization", async () => {
    storeCognitoTokens({
      accessToken: "access-token",
      idToken: "id-token",
      refreshToken: "refresh-token",
    });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/api/words", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer caller-token",
      },
      body: "{}",
    });

    const headers = headersOf(fetchMock);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("Authorization")).toBe("Bearer caller-token");
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
    expect(fetchMock.mock.calls[0][1].body).toBe("{}");
  });

  it("clears the session and notifies on HTTP 401", async () => {
    storeCognitoTokens({
      accessToken: "access-token",
      idToken: "id-token",
      refreshToken: "refresh-token",
    });
    const onUnauthorized = vi.fn();
    const unsubscribe = onUnauthorizedSession(onUnauthorized);
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    vi.stubGlobal("fetch", fetchMock);

    const response = await apiFetch("/api/characters", { method: "GET" });

    expect(response.status).toBe(401);
    expect(getStoredAccessToken()).toBeNull();
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("does not notify on non-401 responses", async () => {
    storeCognitoTokens({
      accessToken: "access-token",
      idToken: "id-token",
      refreshToken: "refresh-token",
    });
    const onUnauthorized = vi.fn();
    const unsubscribe = onUnauthorizedSession(onUnauthorized);
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/api/characters", { method: "GET" });

    expect(getStoredAccessToken()).toBe("access-token");
    expect(onUnauthorized).not.toHaveBeenCalled();
    unsubscribe();
  });
});
