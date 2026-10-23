export const publicUser = (row) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  birthDate: row.birth_date,
  role: row.role || "employee",
});
export const publicTicket = (row) => ({
  id: row.id,
  name: row.name,
  task: row.task,
  checklist: JSON.parse(row.checklist),
  createdAt: row.created_at,
  ownerId: row.user_id,
  assigneeId: row.assignee_id ?? null,
  assigneeName: row.assignee_name ?? null,
});
