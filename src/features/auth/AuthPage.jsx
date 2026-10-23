import React, { useState } from "react";
import Icon from "../../components/Icon.jsx";
import BirthDate from "../../components/BirthDate.jsx";
export default function Auth({ onAuthenticate, message }) {
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    setError("");
    try {
      await onAuthenticate(body, register);
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-layout">
      <aside className="auth-story">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="ticket" />
          </span>
          Ticket Dashboard
        </div>
        <div className="auth-story-copy">
          <span className="eyebrow">TEAM TASK MANAGEMENT</span>
          <h2>
            Clear priorities.
            <br />
            Shared ownership.
            <br />
            <em>Steady progress.</em>
          </h2>
          <p className="auth-description">
            Assign tasks, coordinate your team, and keep delivery moving with a
            simple shared workspace.
          </p>
          <div className="story-check">
            <Icon name="check" /> One place for tasks and people.
          </div>
        </div>
        <span className="story-footer">A little focus goes a long way.</span>
      </aside>
      <section className="auth-card" aria-labelledby="auth-title">
        <span className="eyebrow">YOUR TEAM WORKSPACE</span>
        <h1 id="auth-title">
          {register ? "Start something great" : "Welcome back"}
        </h1>
        <p className="muted">
          {register
            ? "Create an account and make space for your next idea."
            : "Pick up where you left off. Sign in to your workspace."}
        </p>
        <form
          key={String(register)}
          onSubmit={submit}
          className="clr-form clr-form-vertical form-stack"
        >
          {register && (
            <label>
              Full name
              <input
                className="clr-input"
                name="name"
                autoComplete="name"
                maxLength={100}
                required
              />
            </label>
          )}
          <label>
            Email address
            <input
              className="clr-input"
              name="email"
              type="email"
              autoComplete="email"
              maxLength={254}
              required
            />
          </label>
          <label>
            Password
            <input
              className="clr-input"
              name="password"
              type="password"
              autoComplete={register ? "new-password" : "current-password"}
              minLength={register ? 8 : undefined}
              maxLength={128}
              required
            />
            {register && (
              <span className="hint">Use at least 8 characters.</span>
            )}
          </label>
          {register && <BirthDate />}
          {(error || message) && (
            <p className="error" role="alert">
              {error || message}
            </p>
          )}
          <button className="btn btn-primary primary" disabled={busy}>
            {busy ? "Please wait..." : register ? "Create account" : "Sign in"}
            <Icon name="arrow" size={18} />
          </button>
        </form>
        <div className="auth-switch">
          <span>
            {register ? "Already have an account?" : "Need an account?"}
          </span>
          <button
            className="btn btn-link link-button"
            disabled={busy}
            onClick={() => {
              setRegister(!register);
              setError("");
            }}
          >
            {register ? "Sign in" : "Register"}
          </button>
        </div>
      </section>
    </main>
  );
}
