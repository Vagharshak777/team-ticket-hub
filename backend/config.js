import path from "node:path";
import { fileURLToPath } from "node:url";
export const folder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export function writeLog(record) {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    ...record,
  });
  (record.level === "error" ? process.stderr : process.stdout).write(
    `${line}\n`,
  );
}

export function runtimeConfig(env = process.env) {
  const host = env.HOST ?? "127.0.0.1";
  const port = env.PORT ?? "3001";
  if (!host || host.trim() !== host || /[\s/]/.test(host))
    throw new Error("HOST must be a hostname or IP address.");
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)
    throw new Error("PORT must be an integer between 1 and 65535.");
  if (env.DATABASE_PATH !== undefined && !env.DATABASE_PATH.trim())
    throw new Error("DATABASE_PATH must be a nonempty file path.");
  if (
    env.COOKIE_SECURE !== undefined &&
    !["true", "false"].includes(env.COOKIE_SECURE)
  )
    throw new Error("COOKIE_SECURE must be true or false.");
  if (
    env.TRUST_PROXY !== undefined &&
    !["true", "false"].includes(env.TRUST_PROXY)
  )
    throw new Error("TRUST_PROXY must be true or false.");
  return {
    host,
    port: Number(port),
    databasePath:
      env.DATABASE_PATH || path.join(folder, "data", "dashboard.sqlite"),
    secureCookies: env.COOKIE_SECURE === "true",
    trustProxy: env.TRUST_PROXY === "true",
    revision: env.APP_REVISION || "development",
  };
}
