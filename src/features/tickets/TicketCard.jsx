import React from "react";
import { isDone } from "./ticketModel.js";

export default function TicketCard({
  ticket,
  pending,
  onEdit,
  onToggle,
  canEdit = true,
}) {
  const checked = ticket.checklist.filter((item) => item.done).length;
  return (
    <article className="card ticket" key={ticket.id}>
      <div className="ticket-meta">
        <span>#{String(ticket.id).padStart(3, "0")}</span>
        <span
          className={`label ${isDone(ticket) ? "label-success" : "label-info"}`}
        >
          {isDone(ticket)
            ? "Completed"
            : ticket.checklist.some((item) => item.done)
              ? "In progress"
              : "Open"}
        </span>
      </div>
      <div className="ticket-heading">
        <h3>{ticket.name}</h3>
        {canEdit && onEdit && (
          <button
            className="btn btn-sm btn-link"
            disabled={pending}
            onClick={() => onEdit(ticket)}
            aria-label={`Edit ticket: ${ticket.name}`}
          >
            Edit
          </button>
        )}
      </div>
      <p className="ticket-assignee">
        <strong>Assigned to:</strong>{" "}
        {ticket.assignee?.name || ticket.assigneeName || "Unassigned"}
      </p>
      <p className="task">{ticket.task}</p>
      <div className="checklist">
        {ticket.checklist.map((item, index) => (
          <label className={item.done ? "checked" : ""} key={index}>
            <input
              type="checkbox"
              checked={item.done}
              disabled={pending}
              onChange={() => onToggle(ticket, index)}
            />
            <span>{item.text}</span>
          </label>
        ))}
      </div>
      <div className="progress-label">
        <span>Progress</span>
        <span>
          {checked}/{ticket.checklist.length}
        </span>
      </div>
      <progress
        max={ticket.checklist.length}
        value={checked}
        aria-label={`Progress for ${ticket.name}`}
      />
      <p className="ticket-date">
        Created on{" "}
        {new Date(ticket.createdAt).toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })}
      </p>
    </article>
  );
}
