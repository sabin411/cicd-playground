import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../migrations");
const migrationLock = "cicd-playground.schema_migrations";

export function createPool(connectionString: string) {
  return new Pool({ connectionString });
}

export async function initDb(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [migrationLock]);
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          name TEXT PRIMARY KEY,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);

      const files = (await readdir(migrationsDir)).filter((name) => name.endsWith(".sql")).sort();

      for (const name of files) {
        const existing = await client.query("SELECT 1 FROM schema_migrations WHERE name = $1", [name]);
        if (existing.rowCount) {
          continue;
        }

        const sql = await readFile(path.join(migrationsDir, name), "utf8");
        await client.query("BEGIN");
        try {
          await client.query(sql);
          await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      }
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [migrationLock]);
    }
  } finally {
    client.release();
  }
}
