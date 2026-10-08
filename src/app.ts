import express from "express";
import type { Pool } from "pg";
import { z } from "zod";

const createTodoSchema = z.object({
  title: z.string().trim().min(1).max(200),
});

type Todo = {
  id: number;
  title: string;
  done: boolean;
};

export function createApp(pool: Pool) {
  const app = express();
  app.use(express.json());

  app.get("/health", async (_req, res) => {
    try {
      const result = await pool.query<{ count: number }>("SELECT 1 AS count");

      if (result.rowCount !== 1) {
        res.status(500).json({ error: "Database connection failed" });
        return;
      }
    } catch (error) {
      res.status(503).json({ error: (error as Error).message });
      return;
    }

    res.json({ status: "okay" });
  });

  app.get("/api/todos", async (_req, res) => {
    const result = await pool.query<Todo>(
      "SELECT id, title, done FROM todos ORDER BY id",
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
      "INSERT INTO todos (title) VALUES ($1) RETURNING id, title, done",
      [parsed.data.title],
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
      "UPDATE todos SET done = NOT done WHERE id = $1 RETURNING id, title, done",
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
