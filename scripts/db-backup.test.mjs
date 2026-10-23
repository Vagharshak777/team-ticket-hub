import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { createApp } from "../server.js";
import { snapshot } from "./db-backup.mjs";

test("A live WAL snapshot restores committed user, session and ticket records", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "ticket-backup-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const source = path.join(directory, "source.sqlite");
  const destination = path.join(directory, "snapshot.sqlite");
  const app = createApp({ databasePath: source });
  const db = app.locals.database;
  t.after(() => db.close());
  db.exec(`PRAGMA wal_autocheckpoint = 0;
    INSERT INTO users (id, name, email, birth_date, password_hash) VALUES (1, 'Synthetic', 'test@example.invalid', '1990-01-01', 'hash');
    INSERT INTO sessions VALUES ('hashed-token', 1, 9999999999999);
    INSERT INTO tickets (id, user_id, name, task, checklist, created_at) VALUES (1, 1, 'Keep me', 'Restore this ticket', '[]', '2026-10-23');`);
  assert.ok((await stat(source + "-wal")).size > 0);
  const metadata = await snapshot(source, destination, "b".repeat(40));
  assert.equal(metadata.integrity, "ok");
  assert.equal(metadata.revision, "b".repeat(40));
  assert.equal(
    metadata.sha256,
    createHash("sha256")
      .update(await readFile(destination))
      .digest("hex"),
  );
  assert.equal((await stat(destination)).mode & 0o777, 0o600);
  const restored = new DatabaseSync(destination, { readOnly: true });
  try {
    assert.equal(
      restored.prepare("SELECT name FROM tickets").get().name,
      "Keep me",
    );
    assert.equal(
      restored.prepare("SELECT count(*) AS total FROM sessions").get().total,
      1,
    );
    assert.equal(
      restored.prepare("PRAGMA integrity_check").get().integrity_check,
      "ok",
    );
  } finally {
    restored.close();
  }
});

test("Backup refuses missing sources, unrelated databases and existing destinations", async (t) => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "ticket-backup-invalid-"),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  const source = path.join(directory, "source.sqlite");
  const destination = path.join(directory, "snapshot.sqlite");
  await assert.rejects(snapshot(source, destination), /existing regular file/);
  await assert.rejects(stat(source), { code: "ENOENT" });
  const unrelated = new DatabaseSync(source);
  unrelated.close();
  await assert.rejects(snapshot(source, destination));
  await assert.rejects(stat(destination), { code: "ENOENT" });
  await writeFile(destination, "existing snapshot");
  await assert.rejects(snapshot(source, destination), { code: "EEXIST" });
  assert.equal(await readFile(destination, "utf8"), "existing snapshot");
});
