import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { openDatabase } from "./database.js";

test("Role migration preserves legacy accounts, tasks and sessions and can run repeatedly", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "ticket-migration-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filename = path.join(directory, "legacy.sqlite");
  const legacy = new DatabaseSync(filename);
  legacy.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
    birth_date TEXT NOT NULL, password_hash TEXT NOT NULL);
    CREATE TABLE tickets (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
    name TEXT NOT NULL, task TEXT NOT NULL, checklist TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL);
    INSERT INTO users VALUES (1, 'Existing User', 'existing@example.test', '1990-01-01', 'hash');
    INSERT INTO tickets VALUES (1, 1, 'Existing task', 'Keep this task', '[]', '2026-10-23');
    INSERT INTO sessions VALUES ('hashed-token', 1, 9999999999999);`);
  legacy.close();
  for (let attempt = 0; attempt < 2; attempt++) {
    const database = openDatabase(filename);
    try {
      assert.equal(
        database.prepare("SELECT role FROM users WHERE id = 1").get().role,
        "employee",
      );
      const ticket = database
        .prepare("SELECT * FROM tickets WHERE id = 1")
        .get();
      assert.equal(ticket.user_id, 1);
      assert.equal(ticket.name, "Existing task");
      assert.equal(ticket.assignee_id, null);
      assert.equal(
        database.prepare("SELECT COUNT(*) AS count FROM sessions").get().count,
        1,
      );
    } finally {
      database.close();
    }
  }
});
