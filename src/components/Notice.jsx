import React from "react";
export default function Notice({ notice, onDismiss }) {
  if (!notice) return null;
  return (
    <div
      className={`alert notice ${notice.error ? "alert-danger" : "alert-success"}`}
      role={notice.error ? "alert" : "status"}
    >
      <span>{notice.text}</span>
      <button
        className="btn btn-link btn-sm"
        aria-label="Close message"
        onClick={onDismiss}
      >
        Dismiss
      </button>
    </div>
  );
}
