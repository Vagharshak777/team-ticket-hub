import { readTicket, InputError } from "../domain/validation.js";
import { publicTicket } from "../domain/serializers.js";

function assignment(body, user, tickets, previous = null) {
  if (body.assigneeId === undefined) return previous;
  const next = body.assigneeId;
  if (next !== previous && user.role !== "manager")
    throw new InputError("Only managers can assign tasks.", 403);
  if (
    next !== null &&
    (!Number.isInteger(next) || !tickets.employeeExists(next))
  )
    throw new InputError("Choose a valid employee.");
  return next;
}

export function registerTicketRoutes(app, { tickets, requireLogin }) {
  app.get("/api/tickets", requireLogin, (req, res) => {
    res.json({ tickets: tickets.list(req.user).map(publicTicket) });
  });
  app.post("/api/tickets", requireLogin, (req, res) => {
    const ticket = tickets.create(
      req.user,
      readTicket(req.body),
      assignment(req.body, req.user, tickets),
    );
    res.status(201).json({ ticket: publicTicket(ticket) });
  });
  app.patch("/api/tickets/:id", requireLogin, (req, res) => {
    const existing = tickets.find(req.user, req.params.id);
    if (!existing) throw new InputError("Ticket not found.", 404);
    const input = readTicket(req.body);
    const assigneeId = assignment(
      req.body,
      req.user,
      tickets,
      existing.assignee_id,
    );
    // An employee can complete assigned work; the manager owns its definition.
    if (req.user.role !== "manager" && existing.user_id !== req.user.id) {
      const previous = JSON.parse(existing.checklist);
      if (
        input.name !== existing.name ||
        input.task !== existing.task ||
        input.checklist.length !== previous.length ||
        input.checklist.some((step, i) => step.text !== previous[i].text)
      )
        throw new InputError(
          "Only the manager can change assigned task details.",
          403,
        );
    }
    res.json({
      ticket: publicTicket(
        tickets.update(req.user, req.params.id, input, assigneeId),
      ),
    });
  });
  app.delete("/api/tickets/:id", requireLogin, (req, res) => {
    const ticket = tickets.find(req.user, req.params.id);
    if (!ticket) throw new InputError("Ticket not found.", 404);
    if (req.user.role !== "manager" && ticket.user_id !== req.user.id)
      throw new InputError("Only the manager can delete assigned tasks.", 403);
    tickets.remove(req.user, req.params.id);
    res.json({ ok: true });
  });
}
