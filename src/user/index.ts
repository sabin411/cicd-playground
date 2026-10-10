import { Pool } from "pg";
import { z } from "zod";

export const createUserSchema = z.object({
  name: z.string().min(1).max(200),
  username: z.string().min(3).max(20),
  email: z.email(),
});

export const BaseType = z.object({
  id: z.number(),
  created_at: z.date(),
  updated_at: z.date(),
});

export type User = z.infer<typeof createUserSchema> & z.infer<typeof BaseType>;

export async function checkUsername(pool: Pool, username: string) {
  const result = await pool.query(`SELECT id FROM users WHERE username = $1`, [
    username.toLocaleLowerCase(),
  ]);
  if (result.rowCount && result.rowCount > 0) {
    return true;
  }
  return false;
}

export async function checkEmail(pool: Pool, email: string) {
  const result = await pool.query(`SELECT id FROM users WHERE email = $1`, [
    email.toLocaleLowerCase(),
  ]);
  if (result.rowCount && result.rowCount > 0) {
    return true;
  }
  return false;
}

export async function createUser(
  pool: Pool,
  data: z.infer<typeof createUserSchema>,
) {
  const result = await pool.query(
    `INSERT INTO users (name, username, email)
     VALUES ($1, $2, $3)
     RETURNING id, username, email, created_at, updated_at`,
    [
      data.name,
      data.username.toLocaleLowerCase(),
      data.email.toLocaleLowerCase(),
    ],
  );

  return result.rows[0];
}
