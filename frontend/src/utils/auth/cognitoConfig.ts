export type CognitoPublicConfig = {
  region: string;
  userPoolId: string;
  appClientId: string;
  domain?: string;
  issuer?: string;
};

export function loadCognitoPublicConfig(): CognitoPublicConfig | null {
  const region = import.meta.env.VITE_COGNITO_REGION?.trim();
  const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID?.trim();
  const appClientId = import.meta.env.VITE_COGNITO_APP_CLIENT_ID?.trim();

  if (!region || !userPoolId || !appClientId) {
    return null;
  }

  return {
    region,
    userPoolId,
    appClientId,
    domain: import.meta.env.VITE_COGNITO_DOMAIN?.trim() || undefined,
    issuer: import.meta.env.VITE_COGNITO_ISSUER?.trim() || undefined,
  };
}
