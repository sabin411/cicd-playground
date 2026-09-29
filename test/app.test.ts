import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

describe("todo API", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp();
  });

  it("reports healthy", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("creates and lists todos", async () => {
    const created = await request(app).post("/api/todos").send({ title: "Learn GitHub Actions" });

    expect(created.status).toBe(201);
    expect(created.body).toEqual({ id: 1, title: "Learn GitHub Actions", done: false });

    const list = await request(app).get("/api/todos");
    expect(list.body).toHaveLength(1);
  });

  it("rejects an empty title", async () => {
    const res = await request(app).post("/api/todos").send({ title: "   " });

    expect(res.status).toBe(400);
  });

  it("toggles a todo", async () => {
    await request(app).post("/api/todos").send({ title: "Ship it" });

    const res = await request(app).patch("/api/todos/1/toggle");

    expect(res.status).toBe(200);
    expect(res.body.done).toBe(true);
  });

  it("returns 404 for an unknown todo", async () => {
    const res = await request(app).patch("/api/todos/999/toggle");

    expect(res.status).toBe(404);
  });
});
