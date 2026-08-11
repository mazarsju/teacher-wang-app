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
import homeScreenshot from "../assets/screenshots/01-home.png";
import knowledgeBaseViewScreenshot from "../assets/screenshots/02-knowledge-base-view.png";
import knowledgeBaseEditScreenshot from "../assets/screenshots/03-knowledge-base-edit.png";
import chatScreenshot from "../assets/screenshots/04-chat.png";
import chatChallengeScreenshot from "../assets/screenshots/05-chat-challenge-waiter.png";
import ankiSyncImage from "../assets/screenshots/anki-sync.png";
import styles from "./WelcomeAuthPage.module.css";

export type WelcomeAuthMode = "login" | "signup" | "confirm" | "forgot" | "reset";

type WelcomeAuthPageProps = {
  onAuthenticated: () => void;
};

const FEATURES = [
  {
    images: [homeScreenshot],
    title: "Track your progress",
    description:
      "See at a glance where you stand on the HSK ladder — and exactly which characters still stand between you and the next level.",
  },
  {
    images: [knowledgeBaseEditScreenshot, knowledgeBaseViewScreenshot],
    title: "Build your knowledge base",
    description:
      "Add words in a clean edit view — matching characters are created automatically — then browse your vocabulary grouped by pinyin.",
  },
  {
    images: [ankiSyncImage],
    title: "Sync with Anki",
    description:
      "Push new words straight into your Anki decks and pull back the cards you've already mastered — one sync keeps them in lockstep.",
  },
  {
    images: [chatScreenshot, chatChallengeScreenshot],
    title: "Practice with AI agents",
    description:
      "Step into real scenes: role-play with characters like the waiter, clear the checklist, and win the challenge in Mandarin.",
  },
];

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
      className={styles.welcomeAuthGoogleIcon}
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
  const [showFeatures, setShowFeatures] = useState(false);
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
      <div className={styles.welcomeAuth}>
        <div className={styles.welcomeAuthAtmosphere} aria-hidden="true">
          <span className={styles.welcomeAuthGlyph}>学</span>
        </div>
        <div className={styles.welcomeAuthContent}>
          <p className={styles.welcomeAuthOauthStatus} role="status">
            Finishing Google sign-in…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.welcomeAuth}>
      <div className={styles.welcomeAuthAtmosphere} aria-hidden="true">
        <span className={styles.welcomeAuthGlyph}>学</span>
      </div>

      <div className={styles.welcomeAuthContent}>
        <header className={styles.welcomeAuthBrand}>
          <div className={styles.welcomeAuthBrandRow}>
            <img className={styles.welcomeAuthLogo} src={logo} alt="" />
            <p className={styles.welcomeAuthBrandMark}>Teacher Wang</p>
          </div>
          <p className={styles.welcomeAuthTagline}>
            Chat, track knowledge, and climb HSK.
          </p>
          <button
            type="button"
            className={styles.welcomeAuthDiscoverButton}
            onClick={() => setShowFeatures(true)}
          >
            Discover the features →
          </button>
        </header>

        <form className={styles.welcomeAuthForm} onSubmit={handleSubmit} noValidate>
          <h1 className={styles.welcomeAuthFormTitle}>{formTitle}</h1>

          {codeHint ? <p className={styles.welcomeAuthHint}>{codeHint}</p> : null}

          {isLogin || isSignup ? (
            <label className={styles.welcomeAuthField}>
              <span className={styles.welcomeAuthLabel}>Username</span>
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
            <p className={styles.welcomeAuthHint}>
              Username: <strong>{username.trim()}</strong>
            </p>
          ) : null}

          {isSignup || isForgot ? (
            <label className={styles.welcomeAuthField}>
              <span className={styles.welcomeAuthLabel}>Email</span>
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
            <p className={styles.welcomeAuthHint}>
              Resetting password for <strong>{email.trim()}</strong>.
            </p>
          ) : null}

          {isConfirm || isReset ? (
            <label className={styles.welcomeAuthField}>
              <span className={styles.welcomeAuthLabel}>Confirmation code</span>
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
            <label className={styles.welcomeAuthField}>
              <span className={styles.welcomeAuthLabel}>
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
            <p className={styles.welcomeAuthSwitch}>
              <button
                type="button"
                className={styles.welcomeAuthSwitchButton}
                onClick={switchToForgot}
                disabled={isSubmitting}
              >
                Forgot your password?
              </button>
            </p>
          ) : null}

          {error ? (
            <p className={styles.welcomeAuthError} role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            className={styles.welcomeAuthSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Please wait…" : submitLabel}
          </button>

          {showGoogle ? (
            <>
              <div className={styles.welcomeAuthDivider} aria-hidden="true">
                <span>or</span>
              </div>
              <button
                type="button"
                className={styles.welcomeAuthGoogle}
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
            <p className={styles.welcomeAuthSwitch}>
              Wrong account?{" "}
              <button
                type="button"
                className={styles.welcomeAuthSwitchButton}
                onClick={switchToLogin}
                disabled={isSubmitting}
              >
                Back to log in
              </button>
            </p>
          ) : isForgot || isReset ? (
            <p className={styles.welcomeAuthSwitch}>
              <button
                type="button"
                className={styles.welcomeAuthSwitchButton}
                onClick={switchToLogin}
                disabled={isSubmitting}
              >
                Back to log in
              </button>
            </p>
          ) : isSignup ? (
            <p className={styles.welcomeAuthSwitch}>
              Already have an account?{" "}
              <button
                type="button"
                className={styles.welcomeAuthSwitchButton}
                onClick={switchToLogin}
                disabled={isSubmitting}
              >
                Log in
              </button>
            </p>
          ) : (
            <p className={styles.welcomeAuthSwitch}>
              New here?{" "}
              <button
                type="button"
                className={styles.welcomeAuthSwitchButton}
                onClick={switchToSignup}
                disabled={isSubmitting}
              >
                Sign up — it&apos;s free
              </button>
            </p>
          )}
        </form>
      </div>

      <div
        className={`${styles.featureShowcase}${showFeatures ? ` ${styles.featureShowcaseOpen}` : ""}`}
        aria-hidden={!showFeatures}
      >
        <div className={styles.featureShowcaseInner}>
          <button
            type="button"
            className={styles.featureShowcaseBack}
            onClick={() => setShowFeatures(false)}
            tabIndex={showFeatures ? 0 : -1}
          >
            ← Back
          </button>
          <h2 className={styles.featureShowcaseTitle}>
            Everything you need to learn Mandarin
          </h2>
          <div className={styles.featureShowcaseList}>
            {FEATURES.map((feature) => (
              <article className={styles.featureShowcaseCard} key={feature.title}>
                <div className={styles.featureShowcaseImages}>
                  {feature.images.map((image) => (
                    <img src={image} alt="" key={image} />
                  ))}
                </div>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
