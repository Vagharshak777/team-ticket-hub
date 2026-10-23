export const isDone = (ticket) =>
  ticket.checklist.length > 0 && ticket.checklist.every((item) => item.done);
