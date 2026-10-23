import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createApp } from "./app.js";

const task = {
  name: "Verify weekly restore",
  task: "Restore the latest snapshot and record the recovery time.",
  checklist: [{ text: "Verify restored records", done: false }],
};

async function workspace(t) {
  const app = createApp({ databasePath: ":memory:", logger: () => {} });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    app.locals.database.close();
  });
  async function request(route, method = "GET", body, cookie) {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api${route}`,
      {
        method,
        headers: {
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
    );
    return {
      status: response.status,
      body: await response.json(),
      cookie: response.headers.get("set-cookie")?.split(";")[0],
    };
  }
  async function register(name) {
    const profile = {
      name,
      email: `${name.toLowerCase()}@example.test`,
      birthDate: "1990-01-01",
      password: "test12345",
      role: "manager",
    };
    const result = await request("/register", "POST", profile);
    assert.equal(result.status, 201);
    assert.equal(
      result.body.user.role,
      "employee",
      "Public registration must not grant manager privileges.",
    );
    return { ...result, profile, id: result.body.user.id };
  }
  const manager = await register("Manager");
  app.locals.database
    .prepare("UPDATE users SET role = 'manager' WHERE id = ?")
    .run(manager.id);
  const alex = await register("Alex");
  const sara = await register("Sara");
  return { request, manager, alex, sara };
}

test("Roles cannot be elevated through profiles; directory and member access follow role boundaries", async (t) => {
  const { request, manager, alex, sara } = await workspace(t);
  const updated = await request(
    "/profile",
    "PATCH",
    { ...alex.profile, role: "manager" },
    alex.cookie,
  );
  assert.equal(updated.status, 200);
  assert.equal(updated.body.user.role, "employee");
  assert.equal((await request("/users")).status, 401);
  assert.equal(
    (await request("/users", "GET", undefined, alex.cookie)).status,
    403,
  );
  const directory = await request("/users", "GET", undefined, manager.cookie);
  assert.equal(directory.status, 200);
  assert.equal(directory.body.users.length, 3);
  for (const user of directory.body.users) {
    assert.equal(user.password_hash, undefined);
    assert.equal(user.birthDate, undefined);
  }
  assert.equal(
    (await request(`/users/${alex.id}`, "GET", undefined, manager.cookie))
      .status,
    200,
  );
  assert.equal(
    (await request(`/users/${alex.id}`, "GET", undefined, alex.cookie)).status,
    200,
  );
  assert.equal(
    (await request(`/users/${sara.id}`, "GET", undefined, alex.cookie)).status,
    403,
  );
  assert.equal(
    (await request("/users/999999", "GET", undefined, manager.cookie)).status,
    404,
  );
});

test("Managers assign and reassign valid employees; employee lists include only owned or assigned tasks", async (t) => {
  const { request, manager, alex, sara } = await workspace(t);
  for (const assigneeId of [999999, manager.id, "2", -1]) {
    assert.equal(
      (
        await request(
          "/tickets",
          "POST",
          { ...task, assigneeId },
          manager.cookie,
        )
      ).status,
      400,
    );
  }
  const created = await request(
    "/tickets",
    "POST",
    { ...task, assigneeId: alex.id },
    manager.cookie,
  );
  assert.equal(created.status, 201);
  assert.equal(created.body.ticket.assigneeId, alex.id);
  assert.equal(created.body.ticket.assigneeName, "Alex");
  const route = `/tickets/${created.body.ticket.id}`;
  assert.equal(
    (await request("/tickets", "GET", undefined, alex.cookie)).body.tickets
      .length,
    1,
  );
  assert.deepEqual(
    (await request("/tickets", "GET", undefined, sara.cookie)).body.tickets,
    [],
  );
  assert.equal((await request(route, "PATCH", task, sara.cookie)).status, 404);
  const reassigned = await request(
    route,
    "PATCH",
    { ...task, assigneeId: sara.id },
    manager.cookie,
  );
  assert.equal(reassigned.status, 200);
  assert.equal(reassigned.body.ticket.assigneeName, "Sara");
  assert.deepEqual(
    (await request("/tickets", "GET", undefined, alex.cookie)).body.tickets,
    [],
  );
  assert.equal(
    (await request("/tickets", "GET", undefined, sara.cookie)).body.tickets
      .length,
    1,
  );
  const own = await request("/tickets", "POST", task, alex.cookie);
  assert.equal(own.status, 201);
  assert.equal(
    (await request("/tickets", "GET", undefined, manager.cookie)).body.tickets
      .length,
    2,
  );
  assert.equal(
    (
      await request(
        "/tickets",
        "POST",
        { ...task, assigneeId: sara.id },
        alex.cookie,
      )
    ).status,
    403,
  );
});

test("Assigned employees complete checklist items while managers control task details and assignment", async (t) => {
  const { request, manager, alex, sara } = await workspace(t);
  const created = await request(
    "/tickets",
    "POST",
    { ...task, assigneeId: alex.id },
    manager.cookie,
  );
  const route = `/tickets/${created.body.ticket.id}`;
  const done = { ...task, checklist: [{ ...task.checklist[0], done: true }] };
  const completed = await request(route, "PATCH", done, alex.cookie);
  assert.equal(completed.status, 200);
  assert.equal(completed.body.ticket.checklist[0].done, true);
  for (const changed of [
    { ...task, name: "Rewrite task" },
    { ...task, task: "A different task definition" },
    { ...task, checklist: [{ text: "Replace required step", done: true }] },
    { ...task, assigneeId: sara.id },
    { ...task, assigneeId: null },
  ]) {
    assert.equal(
      (await request(route, "PATCH", changed, alex.cookie)).status,
      403,
    );
  }
  assert.equal(
    (await request(route, "DELETE", undefined, alex.cookie)).status,
    403,
  );
  assert.equal(
    (
      await request(
        route,
        "PATCH",
        { ...done, assigneeId: null },
        manager.cookie,
      )
    ).status,
    200,
  );
  assert.equal((await request(route, "PATCH", done, alex.cookie)).status, 404);
  assert.equal(
    (await request(route, "DELETE", undefined, manager.cookie)).status,
    200,
  );
});
