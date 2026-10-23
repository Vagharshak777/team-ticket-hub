import React from "react";
import AuthPage from "./features/auth/AuthPage.jsx";
import ProfilePage from "./features/profile/ProfilePage.jsx";
import TicketList from "./features/tickets/TicketList.jsx";
import TicketDialog from "./features/tickets/TicketDialog.jsx";
import DashboardPage from "./features/dashboard/DashboardPage.jsx";
import UsersPage from "./features/users/UsersPage.jsx";
import UserWorkspacePage from "./features/users/UserWorkspacePage.jsx";
import WorkspaceLayout from "./components/WorkspaceLayout.jsx";
import Notice from "./components/Notice.jsx";
import { useWorkspace } from "./app/useWorkspace.js";

export default function App() {
  const workspace = useWorkspace();
  if (workspace.checking)
    return (
      <p className="loading" role="status">
        Loading your workspace…
      </p>
    );
  if (!workspace.user)
    return (
      <AuthPage
        message={workspace.notice?.error ? workspace.notice.text : ""}
        onAuthenticate={workspace.authenticate}
      />
    );
  const { user, tickets, users, page } = workspace;
  const taskProps = {
    user,
    tickets,
    loading: workspace.loading,
    pending: workspace.pending,
    onCreate: () => workspace.setEditor({ ticket: null }),
    onEdit: (ticket) => workspace.setEditor({ ticket }),
    onToggle: workspace.toggle,
  };
  let content;
  if (page === "tickets") content = <TicketList {...taskProps} />;
  else if (page === "profile")
    content = (
      <ProfilePage key={user.id} user={user} onSave={workspace.saveProfile} />
    );
  else if (page === "users" && user.role === "manager")
    content = (
      <UsersPage
        users={users}
        tickets={tickets}
        onNavigate={workspace.setPage}
      />
    );
  else if (page.startsWith("users/")) {
    const id = Number(page.split("/")[1]);
    const member =
      id === user.id
        ? user
        : user.role === "manager"
          ? users.find((member) => member.id === id)
          : null;
    content =
      member || user.role === "manager" ? (
        <UserWorkspacePage {...taskProps} member={member} currentUser={user} />
      ) : (
        <p role="alert">You can only view your own workspace.</p>
      );
  } else
    content = (
      <DashboardPage
        user={user}
        tickets={tickets}
        users={users}
        loading={workspace.loading}
        onNavigate={workspace.setPage}
      />
    );
  return (
    <WorkspaceLayout
      user={user}
      page={page}
      onNavigate={workspace.setPage}
      ticketCount={tickets.length}
      onLogout={workspace.logout}
      loggingOut={workspace.loggingOut}
    >
      <Notice
        notice={workspace.notice}
        onDismiss={() => workspace.setNotice(null)}
      />
      {content}
      {workspace.editor && (
        <TicketDialog
          ticket={workspace.editor.ticket}
          user={user}
          users={users}
          onClose={() => workspace.setEditor(null)}
          onSave={workspace.saveTicket}
          onDelete={workspace.deleteTicket}
        />
      )}
    </WorkspaceLayout>
  );
}
