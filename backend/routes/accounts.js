import { InputError, readProfile } from "../domain/validation.js";
import { hashPassword, passwordMatches } from "../security/passwords.js";
import { publicUser } from "../domain/serializers.js";
export function registerAccountRoutes(
  app,
  {
    users,
    endSession,
    requireLogin,
    limitAttempts,
    startSession,
    cookieOptions,
  },
) {
  app.get("/api/me", (req, res) =>
    res.json({ user: req.user ? publicUser(req.user) : null }),
  );
  app.post("/api/register", limitAttempts, async (req, res) => {
    const profile = readProfile(req.body);
    const password = req.body?.password;
    if (
      typeof password !== "string" ||
      password.length < 8 ||
      password.length > 128
    )
      throw new InputError("The password must contain 8 to 128 characters.");
    const hash = await hashPassword(password);
    const user = users.create(profile, hash);
    startSession(req, res, user.id);
    res.status(201).json({ user: publicUser(user) });
  });
  app.post("/api/login", limitAttempts, async (req, res) => {
    const email =
      typeof req.body?.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";
    const password = req.body?.password;
    if (
      typeof password !== "string" ||
      password.length > 128 ||
      email.length > 254
    )
      throw new InputError("Email address or password is incorrect.", 401);
    const user = users.findByEmail(email);
    const matches = await passwordMatches(
      password,
      user?.password_hash || `${"0".repeat(32)}:${"0".repeat(128)}`,
    );
    if (!user || !matches)
      throw new InputError("Email address or password is incorrect.", 401);
    startSession(req, res, user.id);
    res.json({ user: publicUser(user) });
  });
  app.post("/api/logout", (req, res) => {
    if (req.sessionHash) endSession(req.sessionHash);
    res.clearCookie("session", cookieOptions);
    res.json({ ok: true });
  });
  app.patch("/api/profile", requireLogin, (req, res) => {
    const profile = readProfile(req.body);
    res.json({ user: publicUser(users.update(req.user.id, profile)) });
  });
}
