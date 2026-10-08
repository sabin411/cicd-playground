import { Pool } from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { initDb } from "../src/db.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const pool = new Pool({ connectionString: databaseUrl });

describe("todo API", () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    await initDb(pool);
  });

  beforeEach(async () => {
    await pool.query("TRUNCATE todos RESTART IDENTITY");
    app = createApp(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("reports healthy", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("creates and lists todos", async () => {
    const created = await request(app)
      .post("/api/todos")
      .send({ title: "Learn GitHub Actions" });

    expect(created.status).toBe(201);
    expect(created.body).toEqual({
      id: 1,
      title: "Learn GitHub Actions",
      done: false,
    });

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

  it("records each migration once", async () => {
    await pool.query("DELETE FROM schema_migrations");

    await Promise.all([initDb(pool), initDb(pool)]);

    const recorded = await pool.query(
      "SELECT name FROM schema_migrations ORDER BY name",
    );
    expect(recorded.rows).toEqual([{ name: "001_create_todos.sql" }]);

    await initDb(pool);
    const again = await pool.query(
      "SELECT name FROM schema_migrations ORDER BY name",
    );
    expect(again.rows).toEqual([{ name: "001_create_todos.sql" }]);
  });
});
