import { loadCognitoPublicConfig } from "./cognitoConfig";
import { CognitoAuthError } from "./cognitoAuth";
import {
  storeCognitoTokens,
  type CognitoTokens,
} from "./tokenStorage";

const OAUTH_STATE_KEY = "tw_cognito_oauth_state";
const OAUTH_VERIFIER_KEY = "tw_cognito_oauth_verifier";
const GOOGLE_IDENTITY_PROVIDER = "Google";

function requireCognitoConfig() {
  const config = loadCognitoPublicConfig();
  if (config === null || !config.domain) {
    throw new CognitoAuthError(
      "NotConfigured",
      "Cognito Hosted UI is not configured. Set VITE_COGNITO_REGION, VITE_COGNITO_USER_POOL_ID, VITE_COGNITO_APP_CLIENT_ID, and VITE_COGNITO_DOMAIN.",
    );
  }
  return config;
}

/** Redirect URI registered on the Cognito app client (must match exactly). */
export function getOAuthRedirectUri(): string {
  return `${window.location.origin}/`;
}

export function getHostedUiBaseUrl(
  region: string,
  domainPrefix: string,
): string {
  return `https://${domainPrefix}.auth.${region}.amazoncognito.com`;
}

function randomUrlSafeString(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

function base64UrlEncode(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256Base64Url(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(digest);
}

function clearOAuthSession(): void {
  sessionStorage.removeItem(OAUTH_STATE_KEY);
  sessionStorage.removeItem(OAUTH_VERIFIER_KEY);
}

function clearOAuthQueryParams(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete("code");
  url.searchParams.delete("state");
  url.searchParams.delete("error");
  url.searchParams.delete("error_description");
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
}

/**
 * Start Cognito Hosted UI Google SSO (authorization code + PKCE).
 * Navigates away to Cognito / Google.
 */
export async function startGoogleSignIn(): Promise<void> {
  const config = requireCognitoConfig();
  const redirectUri = getOAuthRedirectUri();
  const state = randomUrlSafeString();
  const verifier = randomUrlSafeString(48);
  const challenge = await sha256Base64Url(verifier);

  sessionStorage.setItem(OAUTH_STATE_KEY, state);
  sessionStorage.setItem(OAUTH_VERIFIER_KEY, verifier);

  const params = new URLSearchParams({
    client_id: config.appClientId,
    response_type: "code",
    scope: "openid email profile",
    redirect_uri: redirectUri,
    identity_provider: GOOGLE_IDENTITY_PROVIDER,
    state,
    code_challenge_method: "S256",
    code_challenge: challenge,
  });

  const authorizeUrl = `${getHostedUiBaseUrl(config.region, config.domain!)}/oauth2/authorize?${params.toString()}`;
  window.location.assign(authorizeUrl);
}

type TokenEndpointResponse = {
  access_token?: string;
  id_token?: string;
  refresh_token?: string;
  error?: string;
  error_description?: string;
};

async function exchangeAuthorizationCode(
  code: string,
  verifier: string,
): Promise<CognitoTokens> {
  const config = requireCognitoConfig();
  const redirectUri = getOAuthRedirectUri();
  const tokenUrl = `${getHostedUiBaseUrl(config.region, config.domain!)}/oauth2/token`;

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.appClientId,
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const payload = (await response.json()) as TokenEndpointResponse;

  if (!response.ok) {
    throw new CognitoAuthError(
      payload.error ?? "TokenExchangeFailed",
      payload.error_description ?? "Failed to exchange Google sign-in code.",
    );
  }

  if (!payload.access_token || !payload.id_token || !payload.refresh_token) {
    throw new CognitoAuthError(
      "IncompleteTokens",
      "Cognito did not return a full token set from Google sign-in.",
    );
  }

  return {
    accessToken: payload.access_token,
    idToken: payload.id_token,
    refreshToken: payload.refresh_token,
  };
}

/**
 * If the page was opened as a Cognito OAuth redirect, exchange the code and
 * store tokens. Returns tokens on success, null when this is not an OAuth return.
 */
export async function completeOAuthRedirectIfPresent(): Promise<CognitoTokens | null> {
  const url = new URL(window.location.href);
  const oauthError = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");

  if (!oauthError && !code) {
    return null;
  }

  let preserveOAuthSession = false;
  try {
    if (oauthError) {
      const description = (
        url.searchParams.get("error_description") ??
        "Google sign-in was cancelled or failed."
      ).replace(/\+/g, " ");
      // Pre Sign-up Lambda links Google then aborts with this marker. Retry once
      // so the next authorize uses the linked native Cognito user.
      if (description.includes("EXTERNAL_PROVIDER_LINKED")) {
        clearOAuthQueryParams();
        preserveOAuthSession = true;
        await startGoogleSignIn();
        return null;
      }
      throw new CognitoAuthError(oauthError, description);
    }

    const expectedState = sessionStorage.getItem(OAUTH_STATE_KEY);
    const verifier = sessionStorage.getItem(OAUTH_VERIFIER_KEY);

    if (!expectedState || !verifier || returnedState !== expectedState) {
      throw new CognitoAuthError(
        "InvalidOAuthState",
        "Google sign-in could not be verified. Please try again.",
      );
    }

    if (!code) {
      throw new CognitoAuthError(
        "MissingAuthorizationCode",
        "Google sign-in did not return an authorization code.",
      );
    }

    const tokens = await exchangeAuthorizationCode(code, verifier);
    storeCognitoTokens(tokens);
    return tokens;
  } finally {
    if (!preserveOAuthSession) {
      clearOAuthSession();
      clearOAuthQueryParams();
    }
  }
}
