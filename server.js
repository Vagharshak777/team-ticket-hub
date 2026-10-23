// Stable entry point for local development, containers and existing integrations.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "./backend/runtime.js";
import { writeLog } from "./backend/config.js";
export { createApp } from "./backend/app.js";
export { runtimeConfig, writeLog } from "./backend/config.js";
export { startServer } from "./backend/runtime.js";

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    startServer();
  } catch (error) {
    writeLog({
      level: "error",
      event: "startup_failed",
      message: /^(HOST|PORT|DATABASE_PATH|COOKIE_SECURE|TRUST_PROXY) /.test(
        error.message,
      )
        ? error.message
        : "Cannot open the database. Check its directory permissions and free disk space.",
    });
    process.exitCode = 1;
  }
}
