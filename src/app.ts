import express from "express";
import { z } from "zod";

const createTodoSchema = z.object({
  title: z.string().trim().min(1).max(200),
});

type Todo = {
  id: number;
  title: string;
  done: boolean;
};

export function createApp() {
  const todos: Todo[] = [];
  let nextId = 1;

  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/todos", (_req, res) => {
    res.json(todos);
  });

  app.post("/api/todos", (req, res) => {
    const result = createTodoSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ errors: result.error.issues.map((issue) => issue.message) });
      return;
    }

    const todo: Todo = { id: nextId++, title: result.data.title, done: false };
    todos.push(todo);
    res.status(201).json(todo);
  });

  app.patch("/api/todos/:id/toggle", (req, res) => {
    const todo = todos.find((t) => t.id === Number(req.params.id));
    if (!todo) {
      res.status(404).json({ errors: ["Todo not found"] });
      return;
    }

    todo.done = !todo.done;
    res.json(todo);
  });

  return app;
}
