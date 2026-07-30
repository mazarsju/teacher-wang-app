import { useState, type FormEvent } from "react";

export type WelcomeAuthMode = "login" | "signup";

type WelcomeAuthPageProps = {
  /** Called after a valid form submit. Cognito wiring comes later. */
  onAuthenticated: () => void;
};

export default function WelcomeAuthPage({
  onAuthenticated,
}: WelcomeAuthPageProps) {
  const [mode, setMode] = useState<WelcomeAuthMode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");

  const isSignup = mode === "signup";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!username.trim() || !password) {
      return;
    }
    if (isSignup && !email.trim()) {
      return;
    }
    onAuthenticated();
  }

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
          <h1 className="welcome-auth-form-title">
            {isSignup ? "Create your account" : "Welcome back"}
          </h1>

          <label className="welcome-auth-field">
            <span className="welcome-auth-label">Username</span>
            <input
              type="text"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </label>

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
              />
            </label>
          ) : null}

          <label className="welcome-auth-field">
            <span className="welcome-auth-label">Password</span>
            <input
              type="password"
              name="password"
              autoComplete={isSignup ? "new-password" : "current-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          <button type="submit" className="welcome-auth-submit">
            {isSignup ? "Create account" : "Log in"}
          </button>

          {isSignup ? (
            <p className="welcome-auth-switch">
              Already have an account?{" "}
              <button
                type="button"
                className="welcome-auth-switch-button"
                onClick={() => setMode("login")}
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
                onClick={() => setMode("signup")}
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
