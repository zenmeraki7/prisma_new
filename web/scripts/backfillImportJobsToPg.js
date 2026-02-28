// scripts/backfillImportJobsToPg.js

import ImportJob from "../web/schema/importJobSchema.js";
import { pool } from "../web/db/postgres/pool.js";

async function run() {
  const cursor = ImportJob.find({}).cursor();

  for await (const doc of cursor) {
    // INSERT INTO import_jobs (...)
    // ON CONFLICT DO NOTHING
  }
}

run().catch(console.error);