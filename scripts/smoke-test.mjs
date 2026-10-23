import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const [base = "http://127.0.0.1:3001", mode = "check", statePath] = process.argv.slice(2);
const revision = process.env.EXPECTED_REVISION;
async function request(route, options = {}) {
  return fetch(new URL(route, base), { signal: AbortSignal.timeout(5000), ...options });
}
const health = await request("/api/health/ready");
assert.equal(health.status, 200);
const payload = await health.json();
assert.equal(payload.status, "ok");
if (revision) assert.equal(payload.revision, revision);
const homepage = await request("/");
assert.equal(homepage.status, 200);
const html = await homepage.text();
assert.match(html, /id="root"/);
const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)];
assert.ok(assets.length > 0, "Built frontend assets must be referenced.");
for (const [, asset] of assets) assert.equal((await request(asset)).status, 200);

if (mode === "seed") {
  assert.ok(statePath, "Pass a private state file for the synthetic account.");
  const nonce = randomBytes(12).toString("hex");
  const account = { name: "POC Smoke", email: `poc-${nonce}@example.invalid`,
    password: randomBytes(24).toString("hex"), birthDate: "1990-01-01" };
  const registration = await request("/api/register", {
    method: "POST", headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify(account),
  });
  assert.equal(registration.status, 201);
  const cookie = registration.headers.get("set-cookie").split(";")[0];
  const created = await request("/api/tickets", {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie, Origin: base },
    body: JSON.stringify({ name: `Persistence ${nonce}`, task: "Survive recreation and restore",
      checklist: [{ text: "Verify recovery", done: false }] }),
  });
  assert.equal(created.status, 201);
  const ticket = (await created.json()).ticket;
  await writeFile(statePath, JSON.stringify({ account, cookie, ticket }), { mode: 0o600 });
} else if (mode === "verify") {
  const { account, cookie, ticket } = JSON.parse(await readFile(statePath, "utf8"));
  const existing = await request("/api/tickets", { headers: { Cookie: cookie } });
  assert.equal(existing.status, 200, "The session must survive recreation/restore.");
  assert.deepEqual((await existing.json()).tickets.find((item) => item.id === ticket.id), ticket);
  const login = await request("/api/login", {
    method: "POST", headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({ email: account.email, password: account.password }),
  });
  assert.equal(login.status, 200, "The restored account must still accept its password.");
} else {
  assert.equal(mode, "check", "Mode must be check, seed or verify.");
}
console.log(JSON.stringify({ event: "smoke_passed", mode, revision: payload.revision }));
