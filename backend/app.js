import { registerUserRoutes } from "./routes/users.js";
import { createUserRepository } from "./repositories/users.js";
import { createTicketRepository } from "./repositories/tickets.js";
import express from "express";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { openDatabase } from "./database.js";
import { InputError } from "./domain/validation.js";
import { tokenHash } from "./security/passwords.js";
import { registerAccountRoutes } from "./routes/accounts.js";
import { registerTicketRoutes } from "./routes/tickets.js";
import { folder, writeLog } from "./config.js";
const sessionLength = 7 * 24 * 60 * 60 * 1000;
export function createApp({
  databasePath = path.join(folder, "data", "dashboard.sqlite"),
  secureCookies = process.env.COOKIE_SECURE === "true",
  trustProxy = false,
  revision = process.env.APP_REVISION || "development",
  logger = writeLog,
} = {}) {
  const database = openDatabase(databasePath);
  const app = express();
  // Opt in only behind the private, single-hop Caddy gateway.
  if (trustProxy) app.set("trust proxy", 1);
  app.locals.database = database;
  app.locals.shuttingDown = false;
  app.disable("x-powered-by");
  const log = (record) =>
    logger({ service: "ticket-dashboard", revision, ...record });
  app.use((req, res, next) => {
    const started = process.hrtime.bigint();
    req.requestId = randomUUID();
    res.set("X-Request-ID", req.requestId);
    res.on("finish", () => {
      const route = req.route?.path || "unmatched";
      if (healthRoutes.includes(route) && res.statusCode === 200) return;
      log({
        level: res.statusCode >= 500 ? "error" : "info",
        event: "http_request",
        request_id: req.requestId,
        method: req.method,
        route,
        status: res.statusCode,
        duration_ms: Math.round(
          Number(process.hrtime.bigint() - started) / 1e6,
        ),
      });
    });
    next();
  });
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies,
    path: "/",
  };
  const attempts = new Map();
  app.use((req, res, next) => {
    res.set("X-Content-Type-Options", "nosniff");
    next();
  });

  // Health probes do not depend on cookies or session lookups.
  const healthRoutes = [
    "/health",
    "/api/health",
    "/api/health/ready",
    "/api/health/live",
  ];
  app.get("/api/health/live", (_req, res) => {
    res.set("Cache-Control", "no-store").json({ status: "ok", revision });
  });
  const ready = (_req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      if (app.locals.shuttingDown) throw new Error("Shutting down");
      database.prepare("SELECT 1").get();
      res.json({ status: "ok", revision });
    } catch {
      res.status(503).json({ status: "unavailable", revision });
    }
  };
  for (const route of healthRoutes.slice(0, 3)) app.get(route, ready);

  // Block changes from other websites.
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (["POST", "PATCH", "DELETE"].includes(req.method)) {
      const origin = req.get("origin");
      if (origin && origin !== `${req.protocol}://${req.get("host")}`)
        return res.status(403).json({ error: "This request is not allowed." });
      if (
        ["POST", "PATCH"].includes(req.method) &&
        req.path !== "/logout" &&
        !req.is("application/json")
      )
        return res.status(415).json({ error: "Please send the data as JSON." });
    }
    next();
  });
  app.use(express.json({ limit: "64kb" }));
  app.use("/api", (req, res, next) => {
    const token = req.headers.cookie?.match(
      /(?:^|;\s*)session=([a-f0-9]{64})(?:;|$)/,
    )?.[1];
    req.sessionHash = token ? tokenHash(token) : null;
    req.user = req.sessionHash
      ? database
          .prepare(
            `
      SELECT users.* FROM users JOIN sessions ON sessions.user_id = users.id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?
    `,
          )
          .get(req.sessionHash, Date.now())
      : null;
    next();
  });
  function requireLogin(req, res, next) {
    if (!req.user)
      return res.status(401).json({ error: "Please sign in first." });
    next();
  }
  function limitAttempts(req, res, next) {
    const now = Date.now();
    for (const [ip, entry] of attempts)
      if (entry.until <= now) attempts.delete(ip);
    const entry = attempts.get(req.ip) || {
      count: 0,
      until: now + 15 * 60 * 1000,
    };
    entry.count++;
    attempts.set(req.ip, entry);
    if (entry.count > 30) {
      res.set("Retry-After", String(Math.ceil((entry.until - now) / 1000)));
      return res
        .status(429)
        .json({ error: "Too many attempts. Please wait 15 minutes." });
    }
    next();
  }
  function startSession(req, res, userId) {
    if (req.sessionHash)
      database
        .prepare("DELETE FROM sessions WHERE token_hash = ?")
        .run(req.sessionHash);
    database
      .prepare("DELETE FROM sessions WHERE expires_at <= ?")
      .run(Date.now());
    const token = randomBytes(32).toString("hex");
    database
      .prepare(
        "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
      )
      .run(tokenHash(token), userId, Date.now() + sessionLength);
    res.cookie("session", token, { ...cookieOptions, maxAge: sessionLength });
  }
  registerAccountRoutes(app, {
    users: createUserRepository(database),
    endSession: (hash) =>
      database.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hash),
    requireLogin,
    limitAttempts,
    startSession,
    cookieOptions,
  });
  registerUserRoutes(app, { database, requireLogin });
  registerTicketRoutes(app, {
    tickets: createTicketRepository(database),
    requireLogin,
  });
  app.use("/api", (req, res) =>
    res.status(404).json({ error: "API route not found." }),
  );
  if (existsSync(path.join(folder, "dist")))
    app.use(express.static(path.join(folder, "dist")));
  app.use((error, req, res, next) => {
    if (error instanceof InputError)
      return res.status(error.status).json({ error: error.message });
    if (error.message?.includes("UNIQUE constraint failed: users.email"))
      return res
        .status(409)
        .json({ error: "This email address is already registered." });
    if (error.type === "entity.parse.failed")
      return res.status(400).json({ error: "Invalid JSON data." });
    if (error.type === "entity.too.large")
      return res.status(413).json({ error: "The request data is too large." });
    // Error messages and SQL parameters can contain personal information.
    log({
      level: "error",
      event: "unexpected_error",
      request_id: req.requestId,
    });
    res
      .status(500)
      .json({ error: "A server error occurred. Please try again." });
  });
  return app;
}
