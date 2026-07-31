import { loadCognitoPublicConfig } from "./cognitoConfig";
import {
  storeCognitoTokens,
  type CognitoTokens,
} from "./tokenStorage";

type CognitoErrorBody = {
  __type?: string;
  message?: string;
  Message?: string;
};

export class CognitoAuthError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CognitoAuthError";
    this.code = code;
  }
}

type AuthenticationResult = {
  AccessToken?: string;
  IdToken?: string;
  RefreshToken?: string;
};

type InitiateAuthResponse = {
  AuthenticationResult?: AuthenticationResult;
  ChallengeName?: string;
};

type SignUpResponse = {
  UserConfirmed?: boolean;
  CodeDeliveryDetails?: {
    Destination?: string;
    DeliveryMedium?: string;
  };
};

async function cognitoRequest<T>(
  target: string,
  body: Record<string, unknown>,
): Promise<T> {
  const config = loadCognitoPublicConfig();
  if (config === null) {
    throw new CognitoAuthError(
      "NotConfigured",
      "Cognito is not configured. Set VITE_COGNITO_REGION, VITE_COGNITO_USER_POOL_ID, and VITE_COGNITO_APP_CLIENT_ID.",
    );
  }

  const response = await fetch(
    `https://cognito-idp.${config.region}.amazonaws.com/`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-amz-json-1.1",
        "X-Amz-Target": `AWSCognitoIdentityProviderService.${target}`,
      },
      body: JSON.stringify(body),
    },
  );

  const payload = (await response.json()) as T & CognitoErrorBody;

  if (!response.ok) {
    const code = payload.__type?.split("#").pop() ?? "UnknownError";
    const message =
      payload.message ?? payload.Message ?? "Cognito request failed.";
    throw new CognitoAuthError(code, message);
  }

  return payload;
}

function tokensFromAuthResult(result: AuthenticationResult): CognitoTokens {
  if (!result.AccessToken || !result.IdToken || !result.RefreshToken) {
    throw new CognitoAuthError(
      "IncompleteTokens",
      "Cognito did not return a full token set.",
    );
  }

  return {
    accessToken: result.AccessToken,
    idToken: result.IdToken,
    refreshToken: result.RefreshToken,
  };
}

function requireClientId(): string {
  const config = loadCognitoPublicConfig();
  if (config === null) {
    throw new CognitoAuthError(
      "NotConfigured",
      "Cognito is not configured. Set VITE_COGNITO_REGION, VITE_COGNITO_USER_POOL_ID, and VITE_COGNITO_APP_CLIENT_ID.",
    );
  }
  return config.appClientId;
}

/** Sign in with username + password (USER_PASSWORD_AUTH). Stores tokens on success. */
export async function signInWithPassword(
  username: string,
  password: string,
): Promise<CognitoTokens> {
  const clientId = requireClientId();
  const response = await cognitoRequest<InitiateAuthResponse>("InitiateAuth", {
    AuthFlow: "USER_PASSWORD_AUTH",
    ClientId: clientId,
    AuthParameters: {
      USERNAME: username.trim(),
      PASSWORD: password,
    },
  });

  if (response.ChallengeName) {
    throw new CognitoAuthError(
      response.ChallengeName,
      `Additional Cognito challenge required: ${response.ChallengeName}`,
    );
  }

  if (!response.AuthenticationResult) {
    throw new CognitoAuthError(
      "NoAuthenticationResult",
      "Cognito did not return authentication tokens.",
    );
  }

  const tokens = tokensFromAuthResult(response.AuthenticationResult);
  storeCognitoTokens(tokens);
  return tokens;
}

export type SignUpResult = {
  userConfirmed: boolean;
  codeDeliveryDestination?: string;
};

/** Register username + email + password. May require email confirmation before login. */
export async function signUpWithPassword(
  username: string,
  email: string,
  password: string,
): Promise<SignUpResult> {
  const clientId = requireClientId();
  const response = await cognitoRequest<SignUpResponse>("SignUp", {
    ClientId: clientId,
    Username: username.trim(),
    Password: password,
    UserAttributes: [{ Name: "email", Value: email.trim() }],
  });

  return {
    userConfirmed: Boolean(response.UserConfirmed),
    codeDeliveryDestination: response.CodeDeliveryDetails?.Destination,
  };
}

/** Confirm a new account with the email verification code, then sign in. */
export async function confirmSignUpAndSignIn(
  username: string,
  confirmationCode: string,
  password: string,
): Promise<CognitoTokens> {
  const clientId = requireClientId();
  await cognitoRequest("ConfirmSignUp", {
    ClientId: clientId,
    Username: username.trim(),
    ConfirmationCode: confirmationCode.trim(),
  });

  return signInWithPassword(username, password);
}
