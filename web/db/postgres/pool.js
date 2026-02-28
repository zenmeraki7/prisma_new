// FILE: web/db/postgres/pool.js

import pg from "pg";

const { Pool } = pg;

/**
 * Uses DATABASE_URL like:
 * postgres://user:password@host:port/dbname
 *
 * For Neon, grab the connection string from the Neon dashboard
 * and set it as DATABASE_URL in your .env.
 */
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("[postgres] DATABASE_URL env var is required");
}

export const pool = new Pool({
  connectionString,
  max: 10,              // per-process connection cap
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

// Optional helper for graceful shutdown
export async function shutdownPostgresPool() {
  await pool.end();
}