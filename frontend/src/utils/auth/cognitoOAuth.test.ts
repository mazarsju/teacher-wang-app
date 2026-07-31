import { afterEach, describe, expect, it, vi } from "vitest";
import { CognitoAuthError } from "./cognitoAuth";
import {
  completeOAuthRedirectIfPresent,
  getHostedUiBaseUrl,
  getOAuthRedirectUri,
  startGoogleSignIn,
} from "./cognitoOAuth";
import { clearCognitoTokens, getStoredAccessToken } from "./tokenStorage";

describe("cognitoOAuth", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    clearCognitoTokens();
    sessionStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  it("builds the Hosted UI base URL from domain prefix + region", () => {
    expect(getHostedUiBaseUrl("eu-west-1", "teacher-wang-prod-123")).toBe(
      "https://teacher-wang-prod-123.auth.eu-west-1.amazoncognito.com",
    );
  });

  it("uses the origin root as the OAuth redirect URI", () => {
    expect(getOAuthRedirectUri()).toBe(`${window.location.origin}/`);
  });

  it("redirects to Cognito authorize with Google + PKCE", async () => {
    vi.stubEnv("VITE_COGNITO_REGION", "eu-west-1");
    vi.stubEnv("VITE_COGNITO_USER_POOL_ID", "eu-west-1_test");
    vi.stubEnv("VITE_COGNITO_APP_CLIENT_ID", "client123");
    vi.stubEnv("VITE_COGNITO_DOMAIN", "teacher-wang-prod-123");

    const assign = vi.fn();
    vi.stubGlobal("location", {
      ...window.location,
      origin: "http://localhost:5173",
      assign,
    });

    await startGoogleSignIn();

    expect(assign).toHaveBeenCalledTimes(1);
    const url = new URL(String(assign.mock.calls[0][0]));
    expect(url.origin).toBe(
      "https://teacher-wang-prod-123.auth.eu-west-1.amazoncognito.com",
    );
    expect(url.pathname).toBe("/oauth2/authorize");
    expect(url.searchParams.get("client_id")).toBe("client123");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("identity_provider")).toBe("Google");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:5173/");
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
    expect(url.searchParams.get("state")).toBeTruthy();
    expect(sessionStorage.getItem("tw_cognito_oauth_state")).toBe(
      url.searchParams.get("state"),
    );
    expect(sessionStorage.getItem("tw_cognito_oauth_verifier")).toBeTruthy();
  });

  it("exchanges an OAuth code for tokens and stores them", async () => {
    vi.stubEnv("VITE_COGNITO_REGION", "eu-west-1");
    vi.stubEnv("VITE_COGNITO_USER_POOL_ID", "eu-west-1_test");
    vi.stubEnv("VITE_COGNITO_APP_CLIENT_ID", "client123");
    vi.stubEnv("VITE_COGNITO_DOMAIN", "teacher-wang-prod-123");

    sessionStorage.setItem("tw_cognito_oauth_state", "state-abc");
    sessionStorage.setItem("tw_cognito_oauth_verifier", "verifier-abc");
    window.history.replaceState(
      {},
      "",
      "/?code=auth-code&state=state-abc",
    );

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "access-token",
        id_token: "id-token",
        refresh_token: "refresh-token",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const tokens = await completeOAuthRedirectIfPresent();

    expect(tokens).toEqual({
      accessToken: "access-token",
      idToken: "id-token",
      refreshToken: "refresh-token",
    });
    expect(getStoredAccessToken()).toBe("access-token");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://teacher-wang-prod-123.auth.eu-west-1.amazoncognito.com/oauth2/token",
      expect.objectContaining({ method: "POST" }),
    );
    const body = (fetchMock.mock.calls[0][1] as RequestInit).body as URLSearchParams;
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("auth-code");
    expect(body.get("code_verifier")).toBe("verifier-abc");
    expect(window.location.search).toBe("");
  });

  it("rejects OAuth redirects with a mismatched state", async () => {
    vi.stubEnv("VITE_COGNITO_REGION", "eu-west-1");
    vi.stubEnv("VITE_COGNITO_USER_POOL_ID", "eu-west-1_test");
    vi.stubEnv("VITE_COGNITO_APP_CLIENT_ID", "client123");
    vi.stubEnv("VITE_COGNITO_DOMAIN", "teacher-wang-prod-123");

    sessionStorage.setItem("tw_cognito_oauth_state", "expected");
    sessionStorage.setItem("tw_cognito_oauth_verifier", "verifier");
    window.history.replaceState({}, "", "/?code=auth-code&state=wrong");

    await expect(completeOAuthRedirectIfPresent()).rejects.toBeInstanceOf(
      CognitoAuthError,
    );
  });

  it("returns null when the URL is not an OAuth callback", async () => {
    await expect(completeOAuthRedirectIfPresent()).resolves.toBeNull();
  });
});
