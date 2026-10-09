import { createHash } from "node:crypto";
import express, { type Response } from "express";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import {
  checkEmail,
  checkUsername,
  createUser,
  createUserSchema,
} from "./user/index.js";

const createTodoSchema = z.object({
  title: z.string().trim().min(1).max(200),
  user_id: z.number().int().positive(),
});

type Todo = {
  id: number;
  title: string;
  done: boolean;
  user_id: number;
  created_at: Date | string;
  updated_at: Date | string;
};

type SavedRequest = {
  request_hash: string;
  status_code: number;
  response: Todo;
};

function requestHash(body: { title: string; user_id: number }) {
  return createHash("sha256")
    .update(JSON.stringify({ title: body.title, user_id: body.user_id }))
    .digest("hex");
}

function todoResponse(todo: Todo) {
  return {
    ...todo,
    created_at:
      todo.created_at instanceof Date
        ? todo.created_at.toISOString()
        : todo.created_at,
    updated_at:
      todo.updated_at instanceof Date
        ? todo.updated_at.toISOString()
        : todo.updated_at,
  };
}

function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

function sendSaved(res: Response, saved: SavedRequest, hash: string) {
  if (saved.request_hash !== hash) {
    res.status(409).json({
      errors: ["idempotency key was already used with a different request"],
    });
    return;
  }
  res.status(saved.status_code).json(saved.response);
}

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
    const rawUserId = Array.isArray(req.query.user_id)
      ? req.query.user_id[0]
      : req.query.user_id;
    const params: number[] = [];
    let where = "";

    if (rawUserId !== undefined) {
      const userId = Number(rawUserId);
      if (!Number.isInteger(userId) || userId < 1) {
        res
          .status(400)
          .json({ errors: ["user_id must be a positive integer"] });
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
    const rawKey =
      req.headers["x-idempotency-key"] ?? req.headers["idempotency-key"];
    const idempotencyKey = Array.isArray(rawKey) ? rawKey[0] : rawKey;

    if (!idempotencyKey?.trim() || idempotencyKey.length > 200) {
      res.status(400).json({ errors: ["x-idempotency-key is required"] });
      return;
    }

    if (!parsed.success) {
      res
        .status(400)
        .json({ errors: parsed.error.issues.map((issue) => issue.message) });
      return;
    }

    const hash = requestHash(parsed.data);
    const client = await pool.connect();
    try {
      const saved = await createTodoOnce(
        client,
        parsed.data,
        idempotencyKey,
        hash,
      );
      sendSaved(res, saved, hash);
    } finally {
      client.release();
    }
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

  app.get("/api/users/available", async (req, res) => {
    const parsed = createUserSchema
      .pick({ username: true })
      .safeParse(req.query);

    if (!parsed.success) {
      res
        .status(400)
        .json({ errors: parsed.error.issues.map((issue) => issue.message) });
      return;
    }

    try {
      const usernameExists = await checkUsername(pool, parsed.data.username);
      if (usernameExists) {
        res.status(409).json({ errors: ["Username already exists"] });
        return;
      }
      res.status(200).json({ message: "Username is available" });
    } catch (error) {
      if (error instanceof Error) {
        res.status(500).json({ errors: [error.message] });
      } else {
        res.status(500).json({ errors: ["Internal server error"] });
      }
    }
  });

  // Users
  app.post("/api/users", async (req, res) => {
    try {
      const parsed = createUserSchema.safeParse(req.body);
      if (!parsed.success) {
        res
          .status(400)
          .json({ errors: parsed.error.issues.map((issue) => issue.message) });
        return;
      }

      const usernameExists = await checkUsername(pool, parsed.data.username);
      if (usernameExists) {
        res.status(409).json({ errors: ["Username already exists"] });
        return;
      }
      const emailExists = await checkEmail(pool, parsed.data.email);
      if (emailExists) {
        res.status(409).json({ errors: ["Email already exists"] });
        return;
      }

      const user = await createUser(pool, parsed.data);

      res.status(201).json(user);
    } catch (error) {
      if (error instanceof Error) {
        res.status(500).json({ errors: [error.message] });
      } else {
        res.status(500).json({ errors: ["Internal server error"] });
      }
    }
  });

  return app;
}

async function createTodoOnce(
  client: PoolClient,
  body: { title: string; user_id: number },
  idempotencyKey: string,
  hash: string,
): Promise<SavedRequest> {
  await client.query("BEGIN");
  try {
    const existing = await client.query<SavedRequest>(
      `SELECT request_hash, status_code, response
       FROM idempotency_keys
       WHERE user_id = $1 AND key = $2`,
      [body.user_id, idempotencyKey],
    );
    if (existing.rows[0]) {
      await client.query("COMMIT");
      return existing.rows[0];
    }

    const inserted = await client.query<Todo>(
      `INSERT INTO todos (title, user_id)
       VALUES ($1, $2)
       RETURNING id, title, done, user_id, created_at, updated_at`,
      [body.title, body.user_id],
    );
    const response = todoResponse(inserted.rows[0]);
    await client.query(
      `INSERT INTO idempotency_keys (user_id, key, request_hash, status_code, response)
       VALUES ($1, $2, $3, 201, $4)`,
      [body.user_id, idempotencyKey, hash, response],
    );
    await client.query("COMMIT");
    return { request_hash: hash, status_code: 201, response };
  } catch (error) {
    await client.query("ROLLBACK");
    if (!isUniqueViolation(error)) {
      throw error;
    }
  }

  const saved = await client.query<SavedRequest>(
    `SELECT request_hash, status_code, response
     FROM idempotency_keys
     WHERE user_id = $1 AND key = $2`,
    [body.user_id, idempotencyKey],
  );
  return saved.rows[0];
}
