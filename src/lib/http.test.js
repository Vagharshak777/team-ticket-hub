import test from "node:test";
import assert from "node:assert/strict";
import { createHttpClient, ApiError } from "./http.js";

test("HTTP client sends session credentials and JSON mutations through the API boundary", async () => {
  let received;
  const request = createHttpClient(async (...args) => {
    received = args;
    return new Response(JSON.stringify({ ticket: { id: 1 } }), { status: 201 });
  });
  assert.deepEqual(await request("/tickets", "POST", { name: "A ticket" }), {
    ticket: { id: 1 },
  });
  assert.equal(received[0], "/api/tickets");
  assert.equal(received[1].credentials, "same-origin");
  assert.deepEqual(JSON.parse(received[1].body), { name: "A ticket" });
});

test("Expired sessions retain their HTTP status for application recovery", async () => {
  const request = createHttpClient(
    async () =>
      new Response(JSON.stringify({ error: "Please sign in first." }), {
        status: 401,
      }),
  );
  await assert.rejects(
    request("/tickets"),
    (error) =>
      error instanceof ApiError &&
      error.status === 401 &&
      error.message === "Please sign in first.",
  );
});

test("Proxy HTML errors and network failures produce readable feedback", async () => {
  const unavailable = createHttpClient(
    async () => new Response("<html>Bad gateway</html>", { status: 502 }),
  );
  await assert.rejects(
    unavailable("/me"),
    (error) => error.status === 502 && !error.message.includes("html"),
  );
  const offline = createHttpClient(async () => {
    throw new TypeError("Failed to fetch");
  });
  await assert.rejects(
    offline("/me"),
    (error) => error.status === 0 && error.message.includes("connect"),
  );
});

test("Cancellation passes through without presenting a connection error", async () => {
  const controller = new AbortController();
  const request = createHttpClient(async (_url, options) => {
    assert.equal(options.signal, controller.signal);
    throw new DOMException("Aborted", "AbortError");
  });
  await assert.rejects(
    request("/tickets", "GET", undefined, { signal: controller.signal }),
    { name: "AbortError" },
  );
});
