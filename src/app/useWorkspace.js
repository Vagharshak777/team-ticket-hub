import { useEffect, useState } from "react";
import { request } from "../lib/http.js";

export function useWorkspace(client = request) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, updatePage] = useState(() => readPage());
  const [users, setUsers] = useState([]);
  function setPage(next) {
    window.location.hash = next;
    updatePage(next);
    setEditor(null);
  }
  useEffect(() => {
    const navigate = () => {
      updatePage(readPage());
      setEditor(null);
    };
    window.addEventListener("hashchange", navigate);
    return () => window.removeEventListener("hashchange", navigate);
  }, []);
  const [editor, setEditor] = useState(null);
  const [notice, setNotice] = useState(null);
  const [pending, setPending] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    client("/me", "GET", undefined, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setUser(data.user);
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setNotice({ error: true, text: error.message });
      })
      .finally(() => {
        if (!controller.signal.aborted) setChecking(false);
      });
    return () => controller.abort();
  }, [client]);
  useEffect(() => {
    if (!user) return;
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    client("/tickets", "GET", undefined, { signal: controller.signal })
      .then((data) => {
        if (active) setTickets(data.tickets);
      })
      .catch((error) => {
        if (active) showError(error);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    // Ignore old responses after logout.
    return () => {
      active = false;
      controller.abort();
    };
  }, [user?.id, client]);
  useEffect(() => {
    if (user?.role !== "manager") {
      setUsers([]);
      return;
    }
    const controller = new AbortController();
    client("/users", "GET", undefined, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setUsers(data.users);
      })
      .catch((error) => {
        if (!controller.signal.aborted) showError(error);
      });
    return () => controller.abort();
  }, [user?.id, user?.role, client]);
  function showError(error) {
    if (error.status === 401) {
      setUser(null);
      setTickets([]);
      setEditor(null);
    }
    setNotice({ error: true, text: error.message });
  }
  async function accountApi(path, method, body) {
    try {
      return await client(path, method, body);
    } catch (error) {
      if (error.status === 401) showError(error);
      throw error;
    }
  }
  async function saveTicket(body) {
    const { ticket } = await accountApi(
      editor.ticket ? `/tickets/${editor.ticket.id}` : "/tickets",
      editor.ticket ? "PATCH" : "POST",
      body,
    );
    setTickets((current) =>
      editor.ticket
        ? current.map((item) => (item.id === ticket.id ? ticket : item))
        : [ticket, ...current],
    );
    setNotice({ text: editor.ticket ? "Changes saved." : "Ticket created." });
  }
  async function toggle(ticket, index) {
    setPending(true);
    try {
      const checklist = ticket.checklist.map((item, i) =>
        i === index ? { ...item, done: !item.done } : item,
      );
      const data = await accountApi(`/tickets/${ticket.id}`, "PATCH", {
        name: ticket.name,
        task: ticket.task,
        checklist,
      });
      setTickets((current) =>
        current.map((item) => (item.id === ticket.id ? data.ticket : item)),
      );
    } catch (error) {
      showError(error);
    } finally {
      setPending(false);
    }
  }
  async function logout() {
    setLoggingOut(true);
    try {
      await client("/logout", "POST");
      setUser(null);
      setTickets([]);
      setNotice(null);
      setPage("dashboard");
    } catch (error) {
      showError(error);
    } finally {
      setLoggingOut(false);
    }
  }
  async function authenticate(credentials, register) {
    const { user } = await client(
      register ? "/register" : "/login",
      "POST",
      credentials,
    );
    setUser(user);
    setTickets([]);
    setPage("dashboard");
    setNotice(null);
  }
  async function saveProfile(fields) {
    const { user } = await accountApi("/profile", "PATCH", fields);
    setUser(user);
    setNotice({ text: "Profile updated." });
  }
  async function deleteTicket(id) {
    await accountApi(`/tickets/${id}`, "DELETE");
    setTickets((current) => current.filter((ticket) => ticket.id !== id));
    setNotice({ text: "Ticket deleted." });
  }
  return {
    user,
    users,
    checking,
    tickets,
    loading,
    page,
    setPage,
    editor,
    setEditor,
    notice,
    setNotice,
    pending,
    loggingOut,
    authenticate,
    saveProfile,
    deleteTicket,
    saveTicket,
    toggle,
    logout,
  };
}

function readPage() {
  const hash = window.location.hash.slice(1);
  return /^(dashboard|tickets|users|profile|users\/\d+)$/.test(hash)
    ? hash
    : "dashboard";
}
