const select = `SELECT tickets.*, users.name AS assignee_name FROM tickets
  LEFT JOIN users ON users.id = tickets.assignee_id`;

export function createTicketRepository(database) {
  const find = (user, id) =>
    database
      .prepare(
        `${select} WHERE tickets.id = ?
    AND (? = 'manager' OR tickets.user_id = ? OR tickets.assignee_id = ?)`,
      )
      .get(id, user.role, user.id, user.id);
  return {
    find,
    list(user) {
      return database
        .prepare(
          `${select} WHERE ? = 'manager' OR tickets.user_id = ? OR tickets.assignee_id = ?
        ORDER BY tickets.created_at DESC, tickets.id DESC`,
        )
        .all(user.role, user.id, user.id);
    },
    employeeExists(id) {
      return Boolean(
        database
          .prepare("SELECT id FROM users WHERE id = ? AND role = 'employee'")
          .get(id),
      );
    },
    create(user, ticket, assigneeId = null) {
      const result = database
        .prepare(
          `INSERT INTO tickets
        (user_id, name, task, checklist, created_at, assignee_id) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          user.id,
          ticket.name,
          ticket.task,
          JSON.stringify(ticket.checklist),
          new Date().toISOString(),
          assigneeId,
        );
      return find(user, result.lastInsertRowid);
    },
    update(user, id, ticket, assigneeId) {
      database
        .prepare(
          "UPDATE tickets SET name = ?, task = ?, checklist = ?, assignee_id = ? WHERE id = ?",
        )
        .run(
          ticket.name,
          ticket.task,
          JSON.stringify(ticket.checklist),
          assigneeId,
          id,
        );
      return find(user, id);
    },
    remove(user, id) {
      if (!find(user, id)) return false;
      return (
        database.prepare("DELETE FROM tickets WHERE id = ?").run(id).changes > 0
      );
    },
  };
}
