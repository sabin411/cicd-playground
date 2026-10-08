import { existsSync } from "node:fs";
import { createApp } from "./app.js";
import { createPool, initDb } from "./db.js";

if (existsSync(".env")) {
  process.loadEnvFile();
}

const port = Number(process.env.PORT ?? 3000);
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const pool = createPool(databaseUrl);
await initDb(pool);

createApp(pool).listen(port, () => {
  console.log(`Listening on http://localhost:${port}`);
});
