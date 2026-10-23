import { DatabaseSync, backup } from "node:sqlite";
import { createHash } from "node:crypto";
import { closeSync, chmodSync, existsSync, lstatSync, openSync, readFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export async function snapshot(source, destination, revision = "development") {
  if (!existsSync(source) || !lstatSync(source).isFile())
    throw new Error("The source database must be an existing regular file.");
  if (path.resolve(source) === path.resolve(destination))
    throw new Error("The snapshot must use a separate file.");
  // Reserve the destination and refuse to overwrite any existing backup.
  closeSync(openSync(destination, "wx", 0o600));
  let database;
  const deadline = setTimeout(() => process.exit(1), 60_000);
  deadline.unref();
  try {
    database = new DatabaseSync(source, { readOnly: true });
    database.exec("PRAGMA busy_timeout = 5000");
    await backup(database, destination);
    const check = new DatabaseSync(destination, { readOnly: true });
    let schemaVersion, userVersion;
    try {
      const results = check.prepare("PRAGMA integrity_check").all();
      if (results.length !== 1 || results[0].integrity_check !== "ok")
        throw new Error("Snapshot integrity check failed.");
      // Reject an unrelated or empty database.
      for (const table of ["users", "tickets", "sessions"])
        check.prepare(`SELECT 1 FROM ${table} LIMIT 1`).get();
      schemaVersion = check.prepare("PRAGMA schema_version").get().schema_version;
      userVersion = check.prepare("PRAGMA user_version").get().user_version;
    } finally {
      check.close();
    }
    chmodSync(destination, 0o600);
    return {
      created_at: new Date().toISOString(),
      revision,
      schema_version: schemaVersion,
      user_version: userVersion,
      sha256: createHash("sha256").update(readFileSync(destination)).digest("hex"),
      integrity: "ok",
    };
  } catch (error) {
    unlinkSync(destination);
    throw error;
  } finally {
    clearTimeout(deadline);
    database?.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [source, destination] = process.argv.slice(2);
    if (!source || !destination) throw new Error("Pass source and destination paths.");
    console.log(JSON.stringify(await snapshot(source, destination, process.env.APP_REVISION)));
  } catch {
    console.error("SQLite snapshot failed. Check source, space, permissions and integrity.");
    process.exitCode = 1;
  }
}
