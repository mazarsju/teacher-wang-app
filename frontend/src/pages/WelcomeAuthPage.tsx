import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
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
import ankiSyncImage2 from "../assets/screenshots/anki-sync2.png";
import grammarListScreenshot from "../assets/screenshots/grammar-1.png";
import grammarExerciseScreenshot from "../assets/screenshots/grammar-2.png";
import teacherAvatar from "../assets/avatars/teacher.svg";
import styles from "./WelcomeAuthPage.module.css";

export type WelcomeAuthMode = "login" | "signup" | "confirm" | "forgot" | "reset";

type WelcomeAuthPageProps = {
  onAuthenticated: () => void;
};

type FeatureTone = "teal" | "sand" | "lilac" | "amber" | "sage";

type Feature = {
  tone: FeatureTone;
  images: string[];
  icon: ReactNode;
  title: string;
  description: string;
  capabilities: string[];
};

function FeatureGlyph({ children }: { children: ReactNode }) {
  return (
    <span className={styles.featurePanelIcon} aria-hidden="true">
      {children}
    </span>
  );
}

function ChecklistTick() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3.2 8.4 6.1 11.2 12.8 4.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FeaturePanelImages({ images }: { images: string[] }) {
  if (images.length === 3) {
    return (
      <div className={styles.featurePanelMediaMosaic}>
        {images.map((image) => (
          <div className={styles.featurePanelTile} key={image}>
            <img src={image} alt="" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={styles.featurePanelMedia}>
      {images.map((image) => (
        <img src={image} alt="" key={image} />
      ))}
    </div>
  );
}

function buildFeatures(t: TFunction): Feature[] {
  return [
    {
      tone: "sage",
      images: [chatScreenshot, chatChallengeScreenshot],
      icon: (
        <FeatureGlyph>
          <svg viewBox="0 0 24 24">
            <path d="M13 4.5h6.2A1.8 1.8 0 0 1 21 6.3v4.2a1.8 1.8 0 0 1-1.8 1.8H17.8L16 14.2v-1.9" />
            <path d="M3.8 8.2h11.2A2.2 2.2 0 0 1 17.2 10.4v5.3a2.2 2.2 0 0 1-2.2 2.2H9.2L4.8 21v-3.1H3.8A2.2 2.2 0 0 1 1.6 15.7v-5.3A2.2 2.2 0 0 1 3.8 8.2Z" />
            <path d="M6.4 12.2h5.6M6.4 14.8h3.4" />
          </svg>
        </FeatureGlyph>
      ),
      title: t("welcomeAuthPage.features.aiConversations.title"),
      description: t("welcomeAuthPage.features.aiConversations.description"),
      capabilities: t("welcomeAuthPage.features.aiConversations.capabilities", {
        returnObjects: true,
      }) as string[],
    },
    {
      tone: "lilac",
      images: [knowledgeBaseEditScreenshot, knowledgeBaseViewScreenshot],
      icon: (
        <FeatureGlyph>
          <svg viewBox="0 0 24 24">
            <path d="M5 4.5h9.5A2.5 2.5 0 0 1 17 7v13.5H7.5A2.5 2.5 0 0 1 5 18V4.5Z" />
            <path d="M17 7h1.5A2.5 2.5 0 0 1 21 9.5V20a1.5 1.5 0 0 1-1.5 1.5H17" />
            <path d="M8.5 9h6M8.5 12.5h6" />
          </svg>
        </FeatureGlyph>
      ),
      title: t("welcomeAuthPage.features.knowledgeBase.title"),
      description: t("welcomeAuthPage.features.knowledgeBase.description"),
      capabilities: t("welcomeAuthPage.features.knowledgeBase.capabilities", {
        returnObjects: true,
      }) as string[],
    },
    {
      tone: "teal",
      images: [grammarListScreenshot, grammarExerciseScreenshot],
      icon: (
        <FeatureGlyph>
          <svg viewBox="0 0 24 24">
            <path d="M5 7h14M5 12h9M5 17h11" />
            <path d="M16.5 10.5 19 13l3-4" />
          </svg>
        </FeatureGlyph>
      ),
      title: t("welcomeAuthPage.features.grammar.title"),
      description: t("welcomeAuthPage.features.grammar.description"),
      capabilities: t("welcomeAuthPage.features.grammar.capabilities", {
        returnObjects: true,
      }) as string[],
    },
    {
      tone: "sand",
      images: [homeScreenshot, ankiSyncImage, ankiSyncImage2],
      icon: (
        <FeatureGlyph>
          <svg viewBox="0 0 24 24">
            <path d="M4 19V9.5M10 19V5M16 19v-7.5M20 19H3" />
          </svg>
        </FeatureGlyph>
      ),
      title: t("welcomeAuthPage.features.personalizedLearning.title"),
      description: t("welcomeAuthPage.features.personalizedLearning.description"),
      capabilities: t("welcomeAuthPage.features.personalizedLearning.capabilities", {
        returnObjects: true,
      }) as string[],
    },
  ];
}

function authErrorMessage(error: unknown, t: TFunction): string {
  if (error instanceof CognitoAuthError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return t("welcomeAuthPage.errors.generic");
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
  const { t } = useTranslation("auth");
  const features = useMemo(() => buildFeatures(t), [t]);
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
          setError(authErrorMessage(oauthError, t));
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
  }, [onAuthenticated, t]);

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
            ? t("welcomeAuthPage.hints.signupCodeSent", {
                destination: result.codeDeliveryDestination,
              })
            : t("welcomeAuthPage.hints.checkEmailForCode"),
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
        setCodeHint(t("welcomeAuthPage.hints.resetCodeSent"));
        setMode("reset");
        return;
      }

      await confirmPasswordReset(trimmedEmail, confirmationCode.trim(), password);
      setPassword("");
      setConfirmationCode("");
      setEmail("");
      setCodeHint(t("welcomeAuthPage.hints.passwordUpdated"));
      setMode("login");
    } catch (submitError: unknown) {
      setError(authErrorMessage(submitError, t));
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
      setError(authErrorMessage(googleError, t));
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
    ? t("welcomeAuthPage.form.titles.reset")
    : isForgot
      ? t("welcomeAuthPage.form.titles.forgot")
      : isConfirm
        ? t("welcomeAuthPage.form.titles.confirm")
        : isSignup
          ? t("welcomeAuthPage.form.titles.signup")
          : t("welcomeAuthPage.form.titles.login");

  const submitLabel = isReset
    ? t("welcomeAuthPage.form.submitLabels.reset")
    : isForgot
      ? t("welcomeAuthPage.form.submitLabels.forgot")
      : isConfirm
        ? t("welcomeAuthPage.form.submitLabels.confirm")
        : isSignup
          ? t("welcomeAuthPage.form.submitLabels.signup")
          : t("welcomeAuthPage.form.submitLabels.login");

  if (isHandlingOAuth) {
    return (
      <div className={styles.welcomeAuth}>
        <div className={styles.welcomeAuthAtmosphere} aria-hidden="true">
          <span className={styles.welcomeAuthGlyph}>学</span>
        </div>
        <div className={styles.welcomeAuthContent}>
          <p className={styles.welcomeAuthOauthStatus} role="status">
            {t("welcomeAuthPage.oauth.finishing")}
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
            <img
              className={styles.welcomeAuthLogo}
              src={logo}
              alt={t("welcomeAuthPage.brand.logoAlt")}
            />
            <p className={styles.welcomeAuthBrandMark}>{t("welcomeAuthPage.brand.name")}</p>
          </div>
          <h1 className={styles.welcomeAuthTagline}>
            {t("welcomeAuthPage.brand.tagline")}
          </h1>
          <button
            type="button"
            className={styles.welcomeAuthDiscoverButton}
            onClick={() => setShowFeatures(true)}
          >
            {t("welcomeAuthPage.brand.discoverButton")}
          </button>
        </header>

        <form className={styles.welcomeAuthForm} onSubmit={handleSubmit} noValidate>
          <h2 className={styles.welcomeAuthFormTitle}>{formTitle}</h2>

          {codeHint ? <p className={styles.welcomeAuthHint}>{codeHint}</p> : null}

          {isLogin || isSignup ? (
            <label className={styles.welcomeAuthField}>
              <span className={styles.welcomeAuthLabel}>
                {t("welcomeAuthPage.form.usernameLabel")}
              </span>
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
              {t("welcomeAuthPage.form.usernameConfirmLabel")}{" "}
              <strong>{username.trim()}</strong>
            </p>
          ) : null}

          {isSignup || isForgot ? (
            <label className={styles.welcomeAuthField}>
              <span className={styles.welcomeAuthLabel}>
                {t("welcomeAuthPage.form.emailLabel")}
              </span>
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
              {t("welcomeAuthPage.form.resettingPasswordForLabel")}{" "}
              <strong>{email.trim()}</strong>.
            </p>
          ) : null}

          {isConfirm || isReset ? (
            <label className={styles.welcomeAuthField}>
              <span className={styles.welcomeAuthLabel}>
                {t("welcomeAuthPage.form.confirmationCodeLabel")}
              </span>
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
                {isReset
                  ? t("welcomeAuthPage.form.newPasswordLabel")
                  : t("welcomeAuthPage.form.passwordLabel")}
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
                {t("welcomeAuthPage.form.forgotPasswordButton")}
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
            {isSubmitting ? t("welcomeAuthPage.form.submitPending") : submitLabel}
          </button>

          {showGoogle ? (
            <>
              <div className={styles.welcomeAuthDivider} aria-hidden="true">
                <span>{t("welcomeAuthPage.form.orDivider")}</span>
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
                <span>{t("welcomeAuthPage.form.continueWithGoogleButton")}</span>
              </button>
            </>
          ) : null}

          {isConfirm ? (
            <p className={styles.welcomeAuthSwitch}>
              {t("welcomeAuthPage.form.wrongAccountPrompt")}{" "}
              <button
                type="button"
                className={styles.welcomeAuthSwitchButton}
                onClick={switchToLogin}
                disabled={isSubmitting}
              >
                {t("welcomeAuthPage.form.backToLoginButton")}
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
                {t("welcomeAuthPage.form.backToLoginButton")}
              </button>
            </p>
          ) : isSignup ? (
            <p className={styles.welcomeAuthSwitch}>
              {t("welcomeAuthPage.form.alreadyHaveAccountPrompt")}{" "}
              <button
                type="button"
                className={styles.welcomeAuthSwitchButton}
                onClick={switchToLogin}
                disabled={isSubmitting}
              >
                {t("welcomeAuthPage.form.logInButton")}
              </button>
            </p>
          ) : (
            <p className={styles.welcomeAuthSwitch}>
              {t("welcomeAuthPage.form.newHerePrompt")}{" "}
              <button
                type="button"
                className={styles.welcomeAuthSwitchButton}
                onClick={switchToSignup}
                disabled={isSubmitting}
              >
                {t("welcomeAuthPage.form.signUpButton")}
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
            {t("welcomeAuthPage.featureShowcase.backButton")}
          </button>
          <h2 className={styles.featureShowcaseTitle}>
            {t("welcomeAuthPage.featureShowcase.title")}
          </h2>
          <p className={styles.featureShowcaseLead}>
            {t("welcomeAuthPage.featureShowcase.lead")}
          </p>
          <div className={styles.featureShowcaseList}>
            {features.map((feature) => (
              <article
                className={`${styles.featurePanel} ${styles[`feature-panel--${feature.tone}`]}`}
                key={feature.title}
              >
                <div className={styles.featurePanelBody}>
                  <div className={styles.featurePanelHeading}>
                    {feature.icon}
                    <h3>{feature.title}</h3>
                  </div>
                  <p className={styles.featurePanelDescription}>{feature.description}</p>
                  <ul className={styles.featurePanelChecklist}>
                    {feature.capabilities.map((capability) => (
                      <li key={capability}>
                        <span className={styles.featurePanelTick}>
                          <ChecklistTick />
                        </span>
                        <span>{capability}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <FeaturePanelImages images={feature.images} />
              </article>
            ))}
            <section className={styles.featureCompanion} aria-labelledby="feature-companion-title">
              <div className={styles.featureCompanionBody}>
                <p className={styles.featureCompanionEyebrow}>
                  {t("welcomeAuthPage.featureShowcase.companion.eyebrow")}
                </p>
                <h3 id="feature-companion-title">
                  {t("welcomeAuthPage.featureShowcase.companion.title")}
                </h3>
                <p className={styles.featurePanelDescription}>
                  {t("welcomeAuthPage.featureShowcase.companion.description")}
                </p>
                <ul className={styles.featurePanelChecklist}>
                  {(
                    t("welcomeAuthPage.featureShowcase.companion.capabilities", {
                      returnObjects: true,
                    }) as string[]
                  ).map((capability) => (
                    <li key={capability}>
                      <span className={styles.featurePanelTick}>
                        <ChecklistTick />
                      </span>
                      <span>{capability}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <img
                className={styles.featureCompanionAvatar}
                src={teacherAvatar}
                alt={t("welcomeAuthPage.featureShowcase.companion.avatarAlt")}
              />
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
