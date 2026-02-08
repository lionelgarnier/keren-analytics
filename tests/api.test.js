import test from "node:test";
import assert from "node:assert/strict";
import supertest from "supertest";
import { app } from "../src/server.js";

test("mock auth and dashboard overview flow", async () => {
  const request = supertest.agent(app);
  await request.get("/auth/login").redirects(2).expect(200);

  const discovery = await request.get("/azure/discover").expect(200);
  assert.ok(discovery.body.resources.length >= 1);

  const dashboard = await request.get("/dashboard/overview?range=7d").expect(200);
  assert.ok(dashboard.body.dashboard);
  assert.ok(dashboard.body.readiness);
});
