import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CognitoAuthError,
  signInWithPassword,
  signUpWithPassword,
} from "./cognitoAuth";
import { clearCognitoTokens, getStoredAccessToken } from "./tokenStorage";

describe("cognitoAuth", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    clearCognitoTokens();
  });

  it("throws when Cognito env is missing", async () => {
    vi.stubEnv("VITE_COGNITO_REGION", "");
    vi.stubEnv("VITE_COGNITO_USER_POOL_ID", "");
    vi.stubEnv("VITE_COGNITO_APP_CLIENT_ID", "");

    await expect(signInWithPassword("u", "p")).rejects.toBeInstanceOf(
      CognitoAuthError,
    );
  });

  it("calls InitiateAuth with USER_PASSWORD_AUTH and stores tokens", async () => {
    vi.stubEnv("VITE_COGNITO_REGION", "eu-west-1");
    vi.stubEnv("VITE_COGNITO_USER_POOL_ID", "eu-west-1_test");
    vi.stubEnv("VITE_COGNITO_APP_CLIENT_ID", "client123");

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        AuthenticationResult: {
          AccessToken: "access-token",
          IdToken: "id-token",
          RefreshToken: "refresh-token",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const tokens = await signInWithPassword("learner", "Secret123");

    expect(tokens.accessToken).toBe("access-token");
    expect(getStoredAccessToken()).toBe("access-token");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://cognito-idp.eu-west-1.amazonaws.com/",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-Amz-Target":
            "AWSCognitoIdentityProviderService.InitiateAuth",
        }),
      }),
    );

    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body).toEqual({
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: "client123",
      AuthParameters: {
        USERNAME: "learner",
        PASSWORD: "Secret123",
      },
    });
  });

  it("maps Cognito error responses to CognitoAuthError", async () => {
    vi.stubEnv("VITE_COGNITO_REGION", "eu-west-1");
    vi.stubEnv("VITE_COGNITO_USER_POOL_ID", "eu-west-1_test");
    vi.stubEnv("VITE_COGNITO_APP_CLIENT_ID", "client123");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          __type: "NotAuthorizedException",
          message: "Incorrect username or password.",
        }),
      }),
    );

    await expect(signInWithPassword("learner", "bad")).rejects.toMatchObject({
      code: "NotAuthorizedException",
      message: "Incorrect username or password.",
    });
  });

  it("calls SignUp with email attribute", async () => {
    vi.stubEnv("VITE_COGNITO_REGION", "eu-west-1");
    vi.stubEnv("VITE_COGNITO_USER_POOL_ID", "eu-west-1_test");
    vi.stubEnv("VITE_COGNITO_APP_CLIENT_ID", "client123");

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        UserConfirmed: false,
        CodeDeliveryDetails: { Destination: "l***@example.com" },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await signUpWithPassword(
      "learner",
      "learner@example.com",
      "Secret123",
    );

    expect(result).toEqual({
      userConfirmed: false,
      codeDeliveryDestination: "l***@example.com",
    });

    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.UserAttributes).toEqual([
      { Name: "email", Value: "learner@example.com" },
    ]);
  });
});
