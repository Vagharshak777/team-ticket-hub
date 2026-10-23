import React from "react";
import TicketList from "../tickets/TicketList.jsx";

export default function UserWorkspacePage({
  member,
  currentUser,
  tickets,
  loading,
  pending,
  onCreate,
  onEdit,
  onToggle,
}) {
  if (!member)
    return <p role="status">User not found or directory is loading.</p>;
  const personal = tickets.filter(
    (ticket) => ticket.assigneeId === member.id || ticket.ownerId === member.id,
  );

  return (
    <>
      <section className="card member-summary">
        <div className="card-header">{member.name}’s workspace</div>
        <div className="card-block">
          <p>
            {member.email}{" "}
            <span className="label label-info">{member.role}</span>
          </p>
          <p>Personal work and assigned tasks for this team member.</p>
        </div>
      </section>
      <TicketList
        user={currentUser}
        tickets={personal}
        loading={loading}
        pending={pending}
        onCreate={onCreate}
        onEdit={onEdit}
        onToggle={onToggle}
      />
    </>
  );
}
