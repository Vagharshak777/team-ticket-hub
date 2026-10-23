import { InputError } from "../domain/validation.js";
const member = (row) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  role: row.role,
});

export function registerUserRoutes(app, { database, requireLogin }) {
  app.get("/api/users", requireLogin, (req, res) => {
    if (req.user.role !== "manager")
      throw new InputError("Manager access required.", 403);
    res.json({
      users: database
        .prepare(
          "SELECT id, name, email, role FROM users ORDER BY role DESC, name",
        )
        .all()
        .map(member),
    });
  });
  app.get("/api/users/:id", requireLogin, (req, res) => {
    if (req.user.role !== "manager" && String(req.user.id) !== req.params.id)
      throw new InputError("You can only view your own workspace.", 403);
    const user = database
      .prepare("SELECT id, name, email, role FROM users WHERE id = ?")
      .get(req.params.id);
    if (!user) throw new InputError("User not found.", 404);
    res.json({ user: member(user) });
  });
}
