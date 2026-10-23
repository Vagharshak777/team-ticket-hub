import React, { useState } from "react";
import BirthDate from "../../components/BirthDate.jsx";
export default function Profile({ user, onSave }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    setError("");
    try {
      await onSave(fields);
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ACCOUNT SETTINGS</span>
          <h1>My profile</h1>
          <p className="muted">
            Manage your personal information and account details.
          </p>
        </div>
      </div>
      <section className="card profile-card">
        <div className="profile-intro">
          <span className="avatar profile-avatar">
            {user.name.trim().charAt(0).toUpperCase()}
          </span>
          <div>
            <h2>Personal information</h2>
            <p className="muted">{user.email}</p>
            <span className="label label-info">
              {user.role === "manager" ? "Manager" : "Employee"}
            </span>
          </div>
        </div>
        <form
          className="clr-form clr-form-vertical form-stack"
          onSubmit={submit}
        >
          <label>
            Full name
            <input
              className="clr-input"
              name="name"
              autoComplete="name"
              defaultValue={user.name}
              maxLength={100}
              required
            />
          </label>
          <label>
            Email address
            <input
              className="clr-input"
              name="email"
              type="email"
              autoComplete="email"
              defaultValue={user.email}
              maxLength={254}
              required
            />
          </label>
          <BirthDate value={user.birthDate} />
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="btn btn-primary primary" disabled={busy}>
            {busy ? "Saving..." : "Save changes"}
          </button>
        </form>
      </section>
    </>
  );
}
