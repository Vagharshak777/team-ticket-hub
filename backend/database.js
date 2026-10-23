import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
export function openDatabase(databasePath) {
  if (databasePath !== ":memory:")
    mkdirSync(path.dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
      birth_date TEXT NOT NULL, password_hash TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL, task TEXT NOT NULL, checklist TEXT NOT NULL, created_at TEXT NOT NULL
    );
  `);
  // Additive migration: existing accounts stay employees and retain their data.
  const userColumns = database.prepare("PRAGMA table_info(users)").all();
  if (!userColumns.some((column) => column.name === "role"))
    database.exec(
      "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'employee' CHECK(role IN ('manager', 'employee'))",
    );
  const ticketColumns = database.prepare("PRAGMA table_info(tickets)").all();
  if (!ticketColumns.some((column) => column.name === "assignee_id"))
    database.exec(
      "ALTER TABLE tickets ADD COLUMN assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL",
    );
  database.exec(
    "CREATE INDEX IF NOT EXISTS tickets_assignee ON tickets(assignee_id)",
  );
  return database;
}
