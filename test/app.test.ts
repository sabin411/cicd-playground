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

  it("creates and lists todos for one user", async () => {
    const created = await request(app)
      .post("/api/todos")
      .send({ title: "Learn GitHub Actions", user_id: 7 });

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      id: 1,
      title: "Learn GitHub Actions",
      done: false,
      user_id: 7,
    });
    expect(created.body.created_at).toEqual(created.body.updated_at);

    await request(app).post("/api/todos").send({ title: "Other user", user_id: 8 });

    const forUser = await request(app).get("/api/todos").query({ user_id: 7 });
    expect(forUser.status).toBe(200);
    expect(forUser.body).toHaveLength(1);
    expect(forUser.body[0].title).toBe("Learn GitHub Actions");

    const all = await request(app).get("/api/todos");
    expect(all.status).toBe(200);
    expect(all.body.map((todo: { title: string }) => todo.title)).toEqual([
      "Other user",
      "Learn GitHub Actions",
    ]);
  });

  it("rejects an empty title", async () => {
    const res = await request(app).post("/api/todos").send({ title: "   ", user_id: 7 });

    expect(res.status).toBe(400);
  });

  it("toggles a todo and refreshes updated_at", async () => {
    await request(app).post("/api/todos").send({ title: "Ship it", user_id: 7 });
    await pool.query("UPDATE todos SET updated_at = updated_at - interval '1 minute' WHERE id = 1");
    const before = await pool.query<{ updated_at: Date }>("SELECT updated_at FROM todos WHERE id = 1");

    const res = await request(app).patch("/api/todos/1/toggle");

    expect(res.status).toBe(200);
    expect(res.body.done).toBe(true);
    expect(new Date(res.body.updated_at).getTime()).toBeGreaterThan(before.rows[0].updated_at.getTime());
  });

  it("returns 404 for an unknown todo", async () => {
    const res = await request(app).patch("/api/todos/999/toggle");

    expect(res.status).toBe(404);
  });

  it("does not replay applied migrations", async () => {
    const before = await pool.query<{ name: string; applied_at: Date }>(
      "SELECT name, applied_at FROM schema_migrations ORDER BY name",
    );
    expect(before.rows.map((row) => row.name)).toEqual([
      "001_create_todos.sql",
      "002_create_todos.sql",
      "003_udpate_todos.sql",
      "004_todos_timestamptz.sql",
      "005_todos_list_indexes.sql",
    ]);

    await initDb(pool);

    const after = await pool.query<{ name: string; applied_at: Date }>(
      "SELECT name, applied_at FROM schema_migrations ORDER BY name",
    );
    expect(after.rows).toEqual(before.rows);
  });
});
