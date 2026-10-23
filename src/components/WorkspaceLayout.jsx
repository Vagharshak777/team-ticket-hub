import React from "react";
import Icon from "./Icon.jsx";

const pageTitles = {
  dashboard: "Dashboard",
  tickets: "Tasks",
  users: "Users",
  profile: "My profile",
};

export default function WorkspaceLayout({
  user,
  page,
  onNavigate,
  ticketCount,
  onLogout,
  loggingOut,
  children,
}) {
  const manager = user.role === "manager";
  const section = page.split("/")[0];
  const links = [
    ["dashboard", "Dashboard", "grid"],
    ["tickets", manager ? "All tasks" : "My tasks", "ticket"],
    ...(manager ? [["users", "Users", "user"]] : []),
    ["profile", "My profile", "user"],
  ];
  return (
    <div className="app-layout">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="header header-6 topbar">
        <div className="branding">
          <Icon name="ticket" />
          <span className="title">Task workspace</span>
        </div>
        <div className="header-actions">
          <button
            className="btn btn-link account-button"
            onClick={() => onNavigate("profile")}
          >
            <span className="avatar small">
              {user.name.trim().charAt(0).toUpperCase()}
            </span>
            <span className="account-name">{user.name}</span>
          </button>
        </div>
      </header>
      <aside className="sidebar sidenav">
        <p className="nav-caption">WORKSPACE</p>
        <nav aria-label="Main navigation">
          {links.map(([target, label, icon]) => (
            <button
              key={target}
              className={`nav-link ${section === target ? "active" : ""}`}
              aria-current={section === target ? "page" : undefined}
              onClick={() => onNavigate(target)}
            >
              <Icon name={icon} size={18} />
              <span className="nav-text">{label}</span>
              {target === "tickets" && (
                <span className="badge badge-info nav-count">
                  {ticketCount}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="label label-info">
            {manager ? "Manager" : "Employee"}
          </span>
          <p>
            {manager
              ? "Assign work and track your team."
              : "Your assignments and progress."}
          </p>
        </div>
        <div className="sidebar-user">
          <span className="avatar">
            {user.name.trim().charAt(0).toUpperCase()}
          </span>
          <strong className="sidebar-user-name">{user.name}</strong>
          <button
            className="btn btn-link btn-sm"
            onClick={onLogout}
            disabled={loggingOut}
          >
            <Icon name="logout" size={14} />
            {loggingOut ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </aside>
      <div className="main-layout">
        <div className="workspace-breadcrumb">
          Workspace <span>/</span> {pageTitles[section] || "User details"}
          {section === "users" && page.includes("/") ? " / User details" : ""}
        </div>
        <main id="main-content" className="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
