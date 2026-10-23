import { createApp } from "./app.js";
import { runtimeConfig, writeLog } from "./config.js";
export function startServer(env = process.env, logger = writeLog) {
  const config = runtimeConfig(env);
  const app = createApp({ ...config, logger });
  const log = (record) =>
    logger({
      service: "ticket-dashboard",
      revision: config.revision,
      ...record,
    });
  const server = app.listen(config.port, config.host, () =>
    log({
      level: "info",
      event: "startup",
      host: config.host,
      port: config.port,
    }),
  );
  server.on("error", (error) => {
    log({ level: "error", event: "listen_failed", code: error.code });
    app.locals.database.close();
    process.exitCode = 1;
  });
  let stopping = false;
  function shutdown(signal) {
    if (stopping) return;
    stopping = true;
    app.locals.shuttingDown = true;
    log({ level: "info", event: "shutdown", signal });
    const timeout = setTimeout(() => {
      log({ level: "error", event: "shutdown_timeout" });
      server.closeAllConnections();
      process.exit(1);
    }, 20_000);
    timeout.unref();
    server.close(() => {
      clearTimeout(timeout);
      app.locals.database.close();
      process.removeListener("SIGTERM", onTerm);
      process.removeListener("SIGINT", onInt);
    });
  }
  const onTerm = () => shutdown("SIGTERM");
  const onInt = () => shutdown("SIGINT");
  process.once("SIGTERM", onTerm);
  process.once("SIGINT", onInt);
  return { app, server, shutdown };
}
