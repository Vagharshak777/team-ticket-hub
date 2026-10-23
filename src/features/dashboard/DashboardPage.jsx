import React from "react";
import { isDone } from "../tickets/ticketModel.js";

export default function DashboardPage({
  user,
  tickets,
  users,
  loading,
  onNavigate,
}) {
  const complete = tickets.filter(isDone).length;
  const assigned = tickets.filter(
    (ticket) => ticket.assigneeId === user.id,
  ).length;
  const stats = [
    ["Visible tasks", tickets.length],
    ["Active tasks", tickets.length - complete],
    ["Completed", complete],
    [
      user.role === "manager" ? "Team members" : "Assigned to me",
      user.role === "manager"
        ? users.filter((member) => member.role === "employee").length
        : assigned,
    ],
  ];

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            {user.role === "manager" ? "MANAGER OVERVIEW" : "MY WORKSPACE"}
          </span>
          <h1>Welcome, {user.name.split(" ")[0]}</h1>
          <p className="muted">Your team’s work and progress at a glance.</p>
        </div>
        <div className="page-actions">
          <button
            className="btn btn-primary"
            onClick={() => onNavigate("tickets")}
          >
            View tasks
          </button>
          <button
            className="btn btn-outline"
            onClick={() => onNavigate(`users/${user.id}`)}
          >
            My workspace
          </button>
        </div>
      </div>
      <div className="stats">
        {stats.map(([label, value]) => (
          <div className="stat card" key={label}>
            <span className="stat-label">{label}</span>
            <strong>{loading ? "–" : value}</strong>
          </div>
        ))}
      </div>
      <section className="card">
        <div className="card-header">Recent tasks</div>
        <div className="card-block">
          {loading ? (
            <p role="status">Loading tasks…</p>
          ) : tickets.length === 0 ? (
            <p>No tasks yet. Open Tasks to create your first one.</p>
          ) : (
            <div
              className="table-scroll"
              role="region"
              aria-label="Recent tasks"
              tabIndex={0}
            >
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col" className="left">
                      Task
                    </th>
                    <th scope="col" className="left">
                      Assigned to
                    </th>
                    <th scope="col">Progress</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.slice(0, 6).map((ticket) => (
                    <tr key={ticket.id}>
                      <td className="left">
                        <button
                          className="btn btn-link"
                          onClick={() => onNavigate("tickets")}
                        >
                          {ticket.name}
                        </button>
                      </td>
                      <td className="left">
                        {ticket.assigneeName || "Unassigned"}
                      </td>
                      <td>
                        {ticket.checklist.filter((item) => item.done).length}/
                        {ticket.checklist.length}
                      </td>
                      <td>
                        <span
                          className={`label ${isDone(ticket) ? "label-success" : "label-info"}`}
                        >
                          {isDone(ticket)
                            ? "Completed"
                            : ticket.checklist.some((item) => item.done)
                              ? "In progress"
                              : "Open"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
