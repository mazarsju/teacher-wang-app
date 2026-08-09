import { useEffect, useState, type FormEvent } from "react";
import {
  CognitoAuthError,
  confirmSignUpAndSignIn,
  signInWithPassword,
  signUpWithPassword,
} from "../utils/auth/cognitoAuth";
import {
  completeOAuthRedirectIfPresent,
  startGoogleSignIn,
} from "../utils/auth/cognitoOAuth";
import {
  confirmPasswordReset,
  requestPasswordReset,
} from "../utils/auth/passwordResetApi";
import logo from "../assets/logo.png";

export type WelcomeAuthMode = "login" | "signup" | "confirm" | "forgot" | "reset";

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

function GoogleMark() {
  return (
    <svg
      className="welcome-auth-google-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
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
  const [isHandlingOAuth, setIsHandlingOAuth] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.has("code") || params.has("error");
  });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const tokens = await completeOAuthRedirectIfPresent();
        if (cancelled) {
          return;
        }
        if (tokens !== null) {
          onAuthenticated();
          return;
        }
      } catch (oauthError: unknown) {
        if (!cancelled) {
          setError(authErrorMessage(oauthError));
        }
      } finally {
        if (!cancelled) {
          setIsHandlingOAuth(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [onAuthenticated]);

  const isLogin = mode === "login";
  const isSignup = mode === "signup";
  const isConfirm = mode === "confirm";
  const isForgot = mode === "forgot";
  const isReset = mode === "reset";
  const showGoogle = isLogin || isSignup;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmedUsername = username.trim();
    const trimmedEmail = email.trim();
    if (isLogin && (!trimmedUsername || !password)) {
      return;
    }
    if (isSignup && (!trimmedUsername || !password || !trimmedEmail)) {
      return;
    }
    if (isConfirm && (!trimmedUsername || !password || !confirmationCode.trim())) {
      return;
    }
    if (isForgot && !trimmedEmail) {
      return;
    }
    if (isReset && (!trimmedEmail || !confirmationCode.trim() || !password)) {
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
          trimmedEmail,
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

      if (mode === "confirm") {
        await confirmSignUpAndSignIn(
          trimmedUsername,
          confirmationCode,
          password,
        );
        onAuthenticated();
        return;
      }

      if (mode === "forgot") {
        await requestPasswordReset(trimmedEmail);
        setConfirmationCode("");
        setPassword("");
        setCodeHint(
          "If an account with that email exists, a reset code has been sent.",
        );
        setMode("reset");
        return;
      }

      await confirmPasswordReset(trimmedEmail, confirmationCode.trim(), password);
      setPassword("");
      setConfirmationCode("");
      setEmail("");
      setCodeHint("Password updated. Log in with your new password.");
      setMode("login");
    } catch (submitError: unknown) {
      setError(authErrorMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGoogleSignIn() {
    setError(null);
    setIsSubmitting(true);
    try {
      await startGoogleSignIn();
    } catch (googleError: unknown) {
      setError(authErrorMessage(googleError));
      setIsSubmitting(false);
    }
  }

  function switchToLogin() {
    setMode("login");
    setError(null);
    setPassword("");
    setConfirmationCode("");
    setCodeHint(null);
  }

  function switchToSignup() {
    setMode("signup");
    setError(null);
    setConfirmationCode("");
    setCodeHint(null);
  }

  function switchToForgot() {
    setMode("forgot");
    setError(null);
    setPassword("");
    setConfirmationCode("");
    setCodeHint(null);
  }

  const formTitle = isReset
    ? "Set a new password"
    : isForgot
      ? "Reset your password"
      : isConfirm
        ? "Confirm your email"
        : isSignup
          ? "Create your account"
          : "Welcome back";

  const submitLabel = isReset
    ? "Update password"
    : isForgot
      ? "Send reset code"
      : isConfirm
        ? "Confirm and log in"
        : isSignup
          ? "Create account"
          : "Log in";

  if (isHandlingOAuth) {
    return (
      <div className="welcome-auth">
        <div className="welcome-auth-atmosphere" aria-hidden="true">
          <span className="welcome-auth-glyph">学</span>
        </div>
        <div className="welcome-auth-content">
          <p className="welcome-auth-oauth-status" role="status">
            Finishing Google sign-in…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="welcome-auth">
      <div className="welcome-auth-atmosphere" aria-hidden="true">
        <span className="welcome-auth-glyph">学</span>
      </div>

      <div className="welcome-auth-content">
        <header className="welcome-auth-brand">
          <div className="welcome-auth-brand-row">
            <img className="welcome-auth-logo" src={logo} alt="" />
            <p className="welcome-auth-brand-mark">Teacher Wang</p>
          </div>
          <p className="welcome-auth-tagline">
            Practice Mandarin with characters you already know — chat, track
            your knowledge base, and grow toward the next HSK level.
          </p>
        </header>

        <form className="welcome-auth-form" onSubmit={handleSubmit} noValidate>
          <h1 className="welcome-auth-form-title">{formTitle}</h1>

          {codeHint ? <p className="welcome-auth-hint">{codeHint}</p> : null}

          {isLogin || isSignup ? (
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
          ) : isConfirm ? (
            <p className="welcome-auth-hint">
              Username: <strong>{username.trim()}</strong>
            </p>
          ) : null}

          {isSignup || isForgot ? (
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
          ) : isReset ? (
            <p className="welcome-auth-hint">
              Resetting password for <strong>{email.trim()}</strong>.
            </p>
          ) : null}

          {isConfirm || isReset ? (
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
          ) : null}

          {isLogin || isSignup || isReset ? (
            <label className="welcome-auth-field">
              <span className="welcome-auth-label">
                {isReset ? "New password" : "Password"}
              </span>
              <input
                type="password"
                name="password"
                autoComplete={isSignup || isReset ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                disabled={isSubmitting}
              />
            </label>
          ) : null}

          {isLogin ? (
            <p className="welcome-auth-switch">
              <button
                type="button"
                className="welcome-auth-switch-button"
                onClick={switchToForgot}
                disabled={isSubmitting}
              >
                Forgot your password?
              </button>
            </p>
          ) : null}

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

          {showGoogle ? (
            <>
              <div className="welcome-auth-divider" aria-hidden="true">
                <span>or</span>
              </div>
              <button
                type="button"
                className="welcome-auth-google"
                onClick={() => {
                  void handleGoogleSignIn();
                }}
                disabled={isSubmitting}
              >
                <GoogleMark />
                <span>Continue with Google</span>
              </button>
            </>
          ) : null}

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
          ) : isForgot || isReset ? (
            <p className="welcome-auth-switch">
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
