import React, { useState } from "react";
import Icon from "../../components/Icon.jsx";
import TicketCard from "./TicketCard.jsx";
import { isDone } from "./ticketModel.js";

export default function TicketList({
  user,
  tickets,
  loading,
  pending,
  onCreate,
  onEdit,
  onToggle,
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const completed = tickets.filter(isDone).length;
  const visible = tickets.filter((ticket) => {
    const statusMatches =
      filter === "all" ||
      (filter === "done" ? isDone(ticket) : !isDone(ticket));
    return (
      statusMatches &&
      `${ticket.name} ${ticket.task}`
        .toLowerCase()
        .includes(search.trim().toLowerCase())
    );
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">TASK MANAGEMENT</span>
          <h1>Tasks</h1>
          <p className="muted">
            Track work, assign responsibility, and follow progress.
          </p>
        </div>
        <button
          className="btn btn-primary"
          disabled={loading || pending}
          onClick={onCreate}
        >
          <Icon name="plus" size={18} /> New ticket
        </button>
      </div>
      <div className="stats">
        {[
          ["Total tickets", tickets.length],
          ["Open", tickets.length - completed],
          ["Completed", completed],
        ].map(([label, count]) => (
          <div className="stat" key={label}>
            <span className="stat-label">
              {label}
              <Icon
                name={
                  label === "Completed"
                    ? "check"
                    : label === "Open"
                      ? "grid"
                      : "ticket"
                }
                size={20}
              />
            </span>
            <strong>{loading ? "–" : count}</strong>
          </div>
        ))}
      </div>
      <section className="ticket-section" aria-labelledby="tickets-title">
        <div className="section-heading">
          <h2 id="tickets-title">
            Workspace tasks{" "}
            <span className="count-badge">{tickets.length}</span>
          </h2>
          <p>Review your team’s latest work.</p>
        </div>
        <div className="toolbar">
          <div className="filters" aria-label="Filter tickets">
            {[
              ["all", "All tickets"],
              ["open", "Open"],
              ["done", "Completed"],
            ].map(([value, label]) => (
              <button
                key={value}
                aria-pressed={filter === value}
                className={filter === value ? "active" : ""}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="search">
            <span className="sr-only">Search tickets</span>
            <Icon name="search" size={18} />
            <input
              className="clr-input"
              type="search"
              placeholder="Search tickets"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        </div>
        {loading ? (
          <p className="empty" role="status">
            Loading tickets...
          </p>
        ) : visible.length === 0 ? (
          <div className="empty">
            <span className="empty-icon">
              <Icon name={tickets.length ? "search" : "ticket"} size={28} />
            </span>
            <h3>{tickets.length ? "No matching tickets" : "No tickets yet"}</h3>
            <p>
              {tickets.length
                ? "Change your search or filter."
                : "Every great project starts with one small step. Create your first ticket."}
            </p>
            {!tickets.length && (
              <button
                className="btn btn-primary"
                onClick={onCreate}
                disabled={pending}
              >
                <Icon name="plus" size={18} /> Create your first ticket
              </button>
            )}
          </div>
        ) : (
          <div className="ticket-grid">
            {visible.map((ticket) => (
              <TicketCard
                key={ticket.id}
                ticket={ticket}
                pending={pending}
                canEdit={
                  user?.role === "manager" || ticket.ownerId === user?.id
                }
                onEdit={
                  user?.role === "manager" || ticket.ownerId === user?.id
                    ? onEdit
                    : undefined
                }
                onToggle={onToggle}
              />
            ))}
          </div>
        )}
      </section>
      <p className="workspace-note">
        {user?.role === "manager"
          ? "Managers can assign tasks and manage team work."
          : "Your personal tasks and work assigned to you appear here. Update the checklist to report progress."}
      </p>
    </>
  );
}
