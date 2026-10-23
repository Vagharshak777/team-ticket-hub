import React from "react";

export default function UsersPage({ users, tickets, onNavigate }) {
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">PEOPLE</span>
          <h1>Users</h1>
          <p className="muted">
            Open a teammate’s workspace to review their assigned tasks.
          </p>
        </div>
      </div>
      <div className="card">
        <div className="card-header">
          Team directory <span className="badge">{users.length}</span>
        </div>
        <div className="card-block">
          <div
            className="table-scroll"
            role="region"
            aria-label="Team directory"
            tabIndex={0}
          >
            <table className="table">
              <thead>
                <tr>
                  <th scope="col" className="left">
                    Name
                  </th>
                  <th scope="col" className="left">
                    Email
                  </th>
                  <th scope="col">Role</th>
                  <th scope="col">Assigned tasks</th>
                  <th scope="col">Workspace</th>
                </tr>
              </thead>
              <tbody>
                {users.map((member) => (
                  <tr key={member.id}>
                    <td className="left">{member.name}</td>
                    <td className="left">{member.email}</td>
                    <td>
                      <span
                        className={`label ${member.role === "manager" ? "label-purple" : "label-info"}`}
                      >
                        {member.role}
                      </span>
                    </td>
                    <td>
                      {
                        tickets.filter(
                          (ticket) => ticket.assigneeId === member.id,
                        ).length
                      }
                    </td>
                    <td>
                      <button
                        className="btn btn-sm btn-link"
                        onClick={() => onNavigate(`users/${member.id}`)}
                      >
                        View workspace
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!users.length && <p>Loading team directory…</p>}
        </div>
      </div>
    </>
  );
}
