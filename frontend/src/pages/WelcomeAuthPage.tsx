import { useState, type FormEvent } from "react";
import {
  CognitoAuthError,
  confirmSignUpAndSignIn,
  signInWithPassword,
  signUpWithPassword,
} from "../utils/auth/cognitoAuth";

export type WelcomeAuthMode = "login" | "signup" | "confirm";

type WelcomeAuthPageProps = {
  onAuthenticated: () => void;
};

function authErrorMessage(error: unknown): string {
  if (error instanceof CognitoAuthError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong. Please try again.";
}

export default function WelcomeAuthPage({
  onAuthenticated,
}: WelcomeAuthPageProps) {
  const [mode, setMode] = useState<WelcomeAuthMode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [confirmationCode, setConfirmationCode] = useState("");
  const [codeHint, setCodeHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isSignup = mode === "signup";
  const isConfirm = mode === "confirm";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmedUsername = username.trim();
    if (!trimmedUsername || !password) {
      return;
    }
    if (isSignup && !email.trim()) {
      return;
    }
    if (isConfirm && !confirmationCode.trim()) {
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === "login") {
        await signInWithPassword(trimmedUsername, password);
        onAuthenticated();
        return;
      }

      if (mode === "signup") {
        const result = await signUpWithPassword(
          trimmedUsername,
          email.trim(),
          password,
        );
        if (result.userConfirmed) {
          await signInWithPassword(trimmedUsername, password);
          onAuthenticated();
          return;
        }
        setCodeHint(
          result.codeDeliveryDestination
            ? `We sent a code to ${result.codeDeliveryDestination}.`
            : "Check your email for a confirmation code.",
        );
        setMode("confirm");
        return;
      }

      await confirmSignUpAndSignIn(
        trimmedUsername,
        confirmationCode,
        password,
      );
      onAuthenticated();
    } catch (submitError: unknown) {
      setError(authErrorMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  }

  function switchToLogin() {
    setMode("login");
    setError(null);
    setConfirmationCode("");
    setCodeHint(null);
  }

  function switchToSignup() {
    setMode("signup");
    setError(null);
    setConfirmationCode("");
    setCodeHint(null);
  }

  const formTitle = isConfirm
    ? "Confirm your email"
    : isSignup
      ? "Create your account"
      : "Welcome back";

  const submitLabel = isConfirm
    ? "Confirm and log in"
    : isSignup
      ? "Create account"
      : "Log in";

  return (
    <div className="welcome-auth">
      <div className="welcome-auth-atmosphere" aria-hidden="true">
        <span className="welcome-auth-glyph">学</span>
      </div>

      <div className="welcome-auth-content">
        <header className="welcome-auth-brand">
          <p className="welcome-auth-brand-mark">Teacher Wang</p>
          <p className="welcome-auth-tagline">
            Practice Mandarin with characters you already know — chat, track
            your knowledge base, and grow toward the next HSK level.
          </p>
        </header>

        <form className="welcome-auth-form" onSubmit={handleSubmit} noValidate>
          <h1 className="welcome-auth-form-title">{formTitle}</h1>

          {isConfirm && codeHint ? (
            <p className="welcome-auth-hint">{codeHint}</p>
          ) : null}

          {!isConfirm ? (
            <label className="welcome-auth-field">
              <span className="welcome-auth-label">Username</span>
              <input
                type="text"
                name="username"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
                disabled={isSubmitting}
              />
            </label>
          ) : (
            <p className="welcome-auth-hint">
              Username: <strong>{username.trim()}</strong>
            </p>
          )}

          {isSignup ? (
            <label className="welcome-auth-field">
              <span className="welcome-auth-label">Email</span>
              <input
                type="email"
                name="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                disabled={isSubmitting}
              />
            </label>
          ) : null}

          {isConfirm ? (
            <label className="welcome-auth-field">
              <span className="welcome-auth-label">Confirmation code</span>
              <input
                type="text"
                name="confirmationCode"
                autoComplete="one-time-code"
                inputMode="numeric"
                value={confirmationCode}
                onChange={(event) => setConfirmationCode(event.target.value)}
                required
                disabled={isSubmitting}
              />
            </label>
          ) : (
            <label className="welcome-auth-field">
              <span className="welcome-auth-label">Password</span>
              <input
                type="password"
                name="password"
                autoComplete={isSignup ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                disabled={isSubmitting}
              />
            </label>
          )}

          {error ? (
            <p className="welcome-auth-error" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            className="welcome-auth-submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Please wait…" : submitLabel}
          </button>

          {isConfirm ? (
            <p className="welcome-auth-switch">
              Wrong account?{" "}
              <button
                type="button"
                className="welcome-auth-switch-button"
                onClick={switchToLogin}
                disabled={isSubmitting}
              >
                Back to log in
              </button>
            </p>
          ) : isSignup ? (
            <p className="welcome-auth-switch">
              Already have an account?{" "}
              <button
                type="button"
                className="welcome-auth-switch-button"
                onClick={switchToLogin}
                disabled={isSubmitting}
              >
                Log in
              </button>
            </p>
          ) : (
            <p className="welcome-auth-switch">
              New here?{" "}
              <button
                type="button"
                className="welcome-auth-switch-button"
                onClick={switchToSignup}
                disabled={isSubmitting}
              >
                Sign up — it&apos;s free
              </button>
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
