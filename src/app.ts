import express from "express";
import type { Pool } from "pg";
import { z } from "zod";

const createTodoSchema = z.object({
  title: z.string().trim().min(1).max(200),
  user_id: z.number().int().positive(),
});

type Todo = {
  id: number;
  title: string;
  done: boolean;
  user_id: number;
  created_at: Date;
  updated_at: Date;
};

export function createApp(pool: Pool) {
  const app = express();
  app.use(express.json());

  app.use((req, _res, next) => {
    console.log(`${req.method} ${req.path} ${JSON.stringify(req.body)}`);
    next();
  });

  app.get("/health", async (_req, res) => {
    try {
      const result = await pool.query<{ count: number }>("SELECT 1 AS count");

      if (result.rowCount !== 1) {
        res.status(500).json({ error: "Database connection failed" });
        return;
      }
    } catch {
      res.status(503).json({ error: "Internal server error" });
      return;
    }

    res.json({ status: "ok" });
  });

  app.get("/api/todos", async (req, res) => {
    const rawUserId = Array.isArray(req.query.user_id) ? req.query.user_id[0] : req.query.user_id;
    const params: number[] = [];
    let where = "";

    if (rawUserId !== undefined) {
      const userId = Number(rawUserId);
      if (!Number.isInteger(userId) || userId < 1) {
        res.status(400).json({ errors: ["user_id must be a positive integer"] });
        return;
      }
      params.push(userId);
      where = "WHERE user_id = $1";
    }

    const result = await pool.query<Todo>(
      `SELECT id, title, done, user_id, created_at, updated_at
       FROM todos
       ${where}
       ORDER BY created_at DESC, id DESC
       LIMIT 100`,
      params,
    );
    res.json(result.rows);
  });

  app.post("/api/todos", async (req, res) => {
    const parsed = createTodoSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ errors: parsed.error.issues.map((issue) => issue.message) });
      return;
    }

    const result = await pool.query<Todo>(
      "INSERT INTO todos (title, user_id) VALUES ($1, $2) RETURNING id, title, done, user_id, created_at, updated_at",
      [parsed.data.title, parsed.data.user_id],
    );
    res.status(201).json(result.rows[0]);
  });

  app.patch("/api/todos/:id/toggle", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(404).json({ errors: ["Todo not found"] });
      return;
    }

    const result = await pool.query<Todo>(
      `UPDATE todos
       SET done = NOT done, updated_at = now()
       WHERE id = $1
       RETURNING id, title, done, user_id, created_at, updated_at`,
      [id],
    );
    const todo = result.rows[0];
    if (!todo) {
      res.status(404).json({ errors: ["Todo not found"] });
      return;
    }

    res.json(todo);
  });

  return app;
}
