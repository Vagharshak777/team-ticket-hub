import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import path from "node:path";
import { once } from "node:events";
import { createApp, runtimeConfig } from "./server.js";

const adult = {
  name: "Alex Smith",
  email: "alex@example.com",
  password: "secure-password",
  birthDate: "1995-04-12",
};
const sample = {
  name: "Create home page",
  task: "Build a simple home page.",
  checklist: [{ text: "Add heading", done: false }],
};

// Each test has its own temporary database.
async function setup(t) {
  const directory = await mkdtemp(path.join(tmpdir(), "ticket-dashboard-"));
  const databasePath = path.join(directory, "test.sqlite");
  let app, server, base;
  async function start() {
    app = createApp({ databasePath, logger: () => {} });
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    base = `http://127.0.0.1:${server.address().port}`;
  }
  async function stop() {
    await new Promise((resolve) => server.close(resolve));
    app.locals.database.close();
  }
  await start();
  t.after(async () => {
    await stop();
    await rm(directory, { recursive: true, force: true });
  });
  return {
    get database() {
      return app.locals.database;
    },
    get origin() {
      return base;
    },
    async restart() {
      await stop();
      await start();
    },
    async request(route, method = "GET", body, cookie, headers = {}) {
      const response = await fetch(`${base}/api${route}`, {
        method,
        headers: {
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(cookie ? { Cookie: cookie } : {}),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return {
        status: response.status,
        body: await response.json(),
        cookie: response.headers.get("set-cookie")?.split(";")[0],
        headers: response.headers,
      };
    },
  };
}

test("Registration checks age, dates, passwords and duplicate emails", async (t) => {
  const api = await setup(t);
  for (const birthDate of [
    "2020-01-01",
    "1990-02-29",
    "2020-02-30",
    "2099-12-31",
    "invalid",
    "0000-01-01",
  ]) {
    assert.equal(
      (await api.request("/register", "POST", { ...adult, birthDate })).status,
      400,
    );
  }
  assert.equal(
    (await api.request("/register", "POST", { ...adult, password: "tiny" }))
      .status,
    400,
  );
  const today = new Date();
  const month = today.getMonth();
  today.setFullYear(today.getFullYear() - 18);
  if (today.getMonth() !== month) today.setDate(0);
  const birthDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const accepted = await api.request("/register", "POST", {
    ...adult,
    birthDate,
  });
  assert.equal(accepted.status, 201);
  assert.equal(accepted.body.user.birthDate, birthDate);
  assert.equal(accepted.body.user.password_hash, undefined);
  assert.match(accepted.headers.get("set-cookie"), /HttpOnly/);
  assert.match(accepted.headers.get("set-cookie"), /SameSite=Lax/);
  assert.equal(
    (
      await api.request("/register", "POST", {
        ...adult,
        email: "ALEX@EXAMPLE.COM",
      })
    ).status,
    409,
  );
});

test("Health probes are independent of sessions and expose only status and revision", async (t) => {
  const records = [];
  const app = createApp({ databasePath: ":memory:", revision: "a".repeat(40), logger: (record) => records.push(record) });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); });
  for (const route of ["/health", "/api/health", "/api/health/ready", "/api/health/live"]) {
    const response = await fetch(base + route);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { status: "ok", revision: "a".repeat(40) });
  }
  assert.equal(records.length, 0, "Successful health checks should not fill the logs.");
  app.locals.database.close();
  const failed = await fetch(base + "/api/health/ready", { headers: { Cookie: `session=${"a".repeat(64)}` } });
  assert.equal(failed.status, 503, "Session lookup must not mask database readiness.");
  assert.deepEqual(await failed.json(), { status: "unavailable", revision: "a".repeat(40) });
  assert.equal((await fetch(base + "/api/health/live")).status, 200);
});

test("Request and error logs omit credentials, raw URLs and personal data", async (t) => {
  const records = [];
  const app = createApp({ databasePath: ":memory:", logger: (record) => records.push(record) });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    if (app.locals.database.isOpen) app.locals.database.close();
  });
  const secret = "private-personal-value";
  const response = await fetch(base + "/api/login?token=" + secret, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: secret,
      Cookie: `session=${"a".repeat(64)}`, "X-Request-ID": secret },
    body: JSON.stringify({ email: `${secret}@example.com`, password: secret }),
  });
  assert.equal(response.status, 401);
  assert.match(response.headers.get("x-request-id"), /^[a-f0-9-]{36}$/);
  await fetch(base + "/api/tickets/" + secret);
  await fetch(base + "/unknown/" + secret);
  // A closed connection produces a real backend error without a test-only API.
  app.locals.database.close();
  const failed = await fetch(base + "/api/me", { headers: { Cookie: `session=${"a".repeat(64)}` } });
  assert.equal(failed.status, 500);
  assert.deepEqual(await failed.json(), { error: "A server error occurred. Please try again." });
  assert.ok(records.some((record) => record.event === "unexpected_error"));
  assert.ok(records.some((record) => record.route === "unmatched"));
  assert.equal(JSON.stringify(records).includes(secret), false);
  assert.equal(JSON.stringify(records).includes("a".repeat(64)), false);
  assert.equal(records.filter((record) => record.event === "http_request").length, 4);
});

test("Runtime configuration retains safe defaults and rejects invalid settings", () => {
  assert.equal(runtimeConfig({}).host, "127.0.0.1");
  assert.equal(runtimeConfig({}).port, 3001);
  assert.equal(runtimeConfig({ HOST: "0.0.0.0", PORT: "8080", DATABASE_PATH: "/tmp/custom.sqlite" }).port, 8080);
  for (const PORT of ["", "0", "-1", "12x", "1.5", "65536"])
    assert.throws(() => runtimeConfig({ PORT }), /PORT/);
  assert.throws(() => runtimeConfig({ DATABASE_PATH: " " }), /DATABASE_PATH/);
  assert.throws(() => runtimeConfig({ HOST: " " }), /HOST/);
  assert.throws(() => runtimeConfig({ COOKIE_SECURE: "yes" }), /COOKIE_SECURE/);
  assert.equal(runtimeConfig({ TRUST_PROXY: "true" }).trustProxy, true);
  assert.equal(runtimeConfig({}).trustProxy, false);
  assert.throws(() => runtimeConfig({ TRUST_PROXY: "yes" }), /TRUST_PROXY/);
});

test("The real process honors runtime settings and exits cleanly on SIGTERM", { timeout: 10_000 }, async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "ticket-runtime-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const databasePath = path.join(directory, "configured.sqlite");
  const revision = "e".repeat(40);
  const child = spawn(process.execPath, [fileURLToPath(new URL("./server.js", import.meta.url))], {
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(port),
      DATABASE_PATH: databasePath, APP_REVISION: revision, COOKIE_SECURE: "false" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      await once(child, "close");
    }
  });
  const closed = once(child, "close");
  child.stderr.resume();
  const records = [];
  let buffer = "";
  let ready;
  const started = new Promise((resolve) => { ready = resolve; });
  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    let newline;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const record = JSON.parse(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      records.push(record);
      if (record.event === "startup") ready(record);
    }
  });
  const startup = await Promise.race([
    started,
    closed.then(() => { throw new Error("The process exited before startup."); }),
  ]);
  assert.equal(startup.host, "127.0.0.1");
  assert.equal(startup.port, port);
  assert.equal(startup.revision, revision);
  assert.deepEqual(await (await fetch(`http://127.0.0.1:${port}/api/health/ready`)).json(),
    { status: "ok", revision });
  assert.ok((await stat(databasePath)).size > 0);
  child.kill("SIGTERM");
  assert.deepEqual(await closed, [0, null]);
  const shutdown = records.find((record) => record.event === "shutdown");
  assert.equal(shutdown.signal, "SIGTERM");
  assert.equal(shutdown.revision, revision);
  assert.equal(shutdown.service, "ticket-dashboard");
});

test("Login, session rotation and logout work", async (t) => {
  const api = await setup(t);
  const registered = await api.request("/register", "POST", adult);
  const stored = api.database.prepare("SELECT * FROM users").get();
  assert.notEqual(stored.password_hash, adult.password);
  assert.notEqual(
    api.database.prepare("SELECT token_hash FROM sessions").get().token_hash,
    registered.cookie.split("=")[1],
  );
  const wrong = await api.request("/login", "POST", {
    email: adult.email,
    password: "wrong-password",
  });
  const unknown = await api.request("/login", "POST", {
    email: "unknown@example.com",
    password: adult.password,
  });
  assert.equal(wrong.status, 401);
  assert.deepEqual(wrong.body, unknown.body);
  const loggedIn = await api.request(
    "/login",
    "POST",
    { email: adult.email, password: adult.password },
    registered.cookie,
  );
  assert.equal(loggedIn.status, 200);
  assert.notEqual(loggedIn.cookie, registered.cookie);
  assert.equal(
    (await api.request("/me", "GET", undefined, registered.cookie)).body.user,
    null,
  );
  assert.equal(
    (await api.request("/me", "GET", undefined, loggedIn.cookie)).body.user
      .email,
    adult.email,
  );
  await api.request("/logout", "POST", undefined, loggedIn.cookie);
  assert.equal(
    (await api.request("/tickets", "GET", undefined, loggedIn.cookie)).status,
    401,
  );
});

test("Users can create, edit and delete only their own tickets", async (t) => {
  const api = await setup(t);
  const first = await api.request("/register", "POST", adult);
  const second = await api.request("/register", "POST", {
    ...adult,
    email: "second@example.com",
  });
  assert.equal((await api.request("/tickets")).status, 401);
  assert.equal(
    (
      await api.request(
        "/tickets",
        "POST",
        { ...sample, checklist: [] },
        first.cookie,
      )
    ).status,
    400,
  );
  const created = await api.request("/tickets", "POST", sample, first.cookie);
  assert.equal(created.status, 201);
  assert.deepEqual(created.body.ticket.checklist, sample.checklist);
  const route = `/tickets/${created.body.ticket.id}`;
  assert.deepEqual(
    (await api.request("/tickets", "GET", undefined, second.cookie)).body
      .tickets,
    [],
  );
  assert.equal(
    (await api.request(route, "PATCH", sample, second.cookie)).status,
    404,
  );
  assert.equal(
    (await api.request(route, "DELETE", undefined, second.cookie)).status,
    404,
  );
  const updated = await api.request(
    route,
    "PATCH",
    { ...sample, checklist: [{ text: "Add heading", done: true }] },
    first.cookie,
  );
  assert.equal(updated.status, 200);
  assert.equal(updated.body.ticket.checklist[0].done, true);
  assert.equal(updated.body.ticket.createdAt, created.body.ticket.createdAt);
  assert.equal(
    (await api.request(route, "DELETE", undefined, first.cookie)).status,
    200,
  );
  assert.deepEqual(
    (await api.request("/tickets", "GET", undefined, first.cookie)).body
      .tickets,
    [],
  );
});

test("Profile, tickets and sessions survive a restart", async (t) => {
  const api = await setup(t);
  const registered = await api.request("/register", "POST", adult);
  const cookie = registered.cookie;
  const profile = {
    name: "Alex Taylor",
    email: "new@example.com",
    birthDate: "1991-08-20",
  };
  await api.request("/register", "POST", {
    ...adult,
    email: "taken@example.com",
  });
  assert.equal((await api.request("/profile", "PATCH", profile)).status, 401);
  assert.equal(
    (
      await api.request(
        "/profile",
        "PATCH",
        { ...profile, birthDate: "2020-01-01" },
        cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await api.request(
        "/profile",
        "PATCH",
        { ...profile, email: "taken@example.com" },
        cookie,
      )
    ).status,
    409,
  );
  assert.equal(
    (await api.request("/profile", "PATCH", profile, cookie)).status,
    200,
  );
  await api.request("/tickets", "POST", sample, cookie);
  await api.restart();
  assert.equal(
    (await api.request("/me", "GET", undefined, cookie)).body.user.email,
    profile.email,
  );
  assert.equal(
    (await api.request("/tickets", "GET", undefined, cookie)).body.tickets[0]
      .name,
    sample.name,
  );
  assert.equal(
    (
      await api.request("/login", "POST", {
        email: profile.email,
        password: adult.password,
      })
    ).status,
    200,
  );
  api.database.prepare("UPDATE sessions SET expires_at = 0").run();
  assert.equal(
    (await api.request("/me", "GET", undefined, cookie)).body.user,
    null,
  );
});

test("Block other websites, wrong content types and repeated login attempts", async (t) => {
  const api = await setup(t);
  assert.equal(
    (
      await api.request("/register", "POST", adult, undefined, {
        Origin: "https://other.example",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await api.request("/register", "POST", adult, undefined, {
        "Content-Type": "text/plain",
      })
    ).status,
    415,
  );
  assert.equal(
    (
      await api.request("/register", "POST", adult, undefined, {
        Origin: api.origin,
      })
    ).status,
    201,
  );
  for (let i = 0; i < 29; i++)
    assert.equal(
      (await api.request("/login", "POST", { password: 123 })).status,
      401,
    );
  const limited = await api.request("/login", "POST", { password: 123 });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get("retry-after")) > 0);
});

test("A trusted HTTPS gateway allows same-origin writes and sets secure cookies", async (t) => {
  const app = createApp({ databasePath: ":memory:", trustProxy: true, secureCookies: true, logger: () => {} });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    app.locals.database.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { "Content-Type": "application/json",
    "X-Forwarded-Proto": "https", "X-Forwarded-For": "198.51.100.10", Origin: base.replace("http:", "https:") };
  const response = await fetch(base + "/api/register", { method: "POST", headers, body: JSON.stringify(adult) });
  assert.equal(response.status, 201);
  assert.match(response.headers.get("set-cookie"), /; Secure/);
  const rejected = await fetch(base + "/api/logout", { method: "POST", headers: { ...headers, Origin: "https://foreign.example" } });
  assert.equal(rejected.status, 403);
});
