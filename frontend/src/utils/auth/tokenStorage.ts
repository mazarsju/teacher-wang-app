const ACCESS_TOKEN_KEY = "tw_cognito_access_token";
const ID_TOKEN_KEY = "tw_cognito_id_token";
const REFRESH_TOKEN_KEY = "tw_cognito_refresh_token";

export type CognitoTokens = {
  accessToken: string;
  idToken: string;
  refreshToken: string;
};

export function storeCognitoTokens(tokens: CognitoTokens): void {
  sessionStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  sessionStorage.setItem(ID_TOKEN_KEY, tokens.idToken);
  sessionStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
}

export function clearCognitoTokens(): void {
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(ID_TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function getStoredAccessToken(): string | null {
  return sessionStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getStoredIdToken(): string | null {
  return sessionStorage.getItem(ID_TOKEN_KEY);
}

export function getStoredRefreshToken(): string | null {
  return sessionStorage.getItem(REFRESH_TOKEN_KEY);
}

export function hasStoredSession(): boolean {
  return Boolean(getStoredAccessToken());
}
