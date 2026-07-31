import { getStoredAccessToken, getStoredIdToken } from "./tokenStorage";

export const ID_TOKEN_HEADER = "X-Id-Token";

/**
 * Attach the Cognito session to a request.
 *
 * The backend authenticates every route with the access token and reads the
 * verified email from the ID token companion header when it is available.
 */
export function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};

  const accessToken = getStoredAccessToken();
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const idToken = getStoredIdToken();
  if (idToken) {
    headers[ID_TOKEN_HEADER] = idToken;
  }

  return headers;
}

/** `fetch` for the Flask API: same signature, plus the Cognito headers. */
export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  for (const [name, value] of Object.entries(authHeaders())) {
    if (!headers.has(name)) {
      headers.set(name, value);
    }
  }
  return fetch(input, { ...init, headers });
}
