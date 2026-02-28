// FILE: web/services/bulkService/bulkEditService.pg.js

import { pool } from "../../db/postgres/pool.js";
import { Queue } from "bullmq";
import { redis } from "../../queues/redisConnection.js"; // your existing Redis connection
import logger from "../../utils/logger.server.js";

import { validateBulkEditPayload } from "./bulkEditRegistry.server.js";

// Reuse this queue name from the worker file.
export const BULK_EDIT_PG_QUEUE = "bulk-edit-pg";

/**
 * BullMQ queue for PG-based bulk edit jobs.
 */
export const bulkEditQueuePg = new Queue(BULK_EDIT_PG_QUEUE, {
  connection: redis,
});

/**
 * Create a bulk edit job:
 *  - Inserts into bulk_jobs table
 *  - Enqueues a BullMQ job with { bulkJobId }
 *
 * @param {Object} params
 * @param {number} params.shopId
 * @param {string} params.jobType            e.g. "PRODUCT_BULK_EDIT"
 * @param {Object|null} params.filterConfig  DSL filter group
 * @param {Object} params.inputPayload       fields to edit
 * @param {Object} [params.inputMeta]        user, UI path, etc.
 * @param {boolean} [params.isRecurring]
 * @param {string|null} [params.scheduleCron]
 * @param {string|null} [params.scheduleTz]
 * @param {string|null} [params.idempotencyKey]
 */
export async function createBulkEditJobPg(params) {
  const {
    shopId,
    jobType,
    filterConfig,
    inputPayload,
    inputMeta,
    isRecurring = false,
    scheduleCron = null,
    scheduleTz = null,
    idempotencyKey = null,
  } = params;

    let normalizedPayload;
  try {
    normalizedPayload = validateBulkEditPayload(inputPayload);
  } catch (err) {
    // Map to your error class / 400 response upstream
    const error = new Error(`invalidBulkEditPayload: ${err.message}`);
    error.isBadRequest = true;
    throw error;
  }
  if (!shopId) {
    throw new Error("createBulkEditJobPg: shopId is required");
  }
  if (!jobType) {
    throw new Error("createBulkEditJobPg: jobType is required");
  }
  if (!inputPayload) {
    throw new Error("createBulkEditJobPg: inputPayload is required");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1) Insert bulk_jobs row
    const insertSql = `
      INSERT INTO bulk_jobs (
        shop_id,
        job_type,
        status,
        is_recurring,
        schedule_cron,
        schedule_tz,
        next_run_at,
        idempotency_key,
        source_path,
        input_filters,
        input_payload,
        input_meta,
        stats
      )
      VALUES (
        $1,
        $2,
        'pending',
        $3,
        $4,
        $5,
        CASE WHEN $3 = TRUE THEN NOW() ELSE NULL END,
        $6,
        $7,
        $8::jsonb,
        $9::jsonb,
        $10::jsonb,
        '{}'::jsonb
      )
      RETURNING id, created_at
    `;

    const sourcePath = inputMeta?.sourcePath || null;

    const { rows } = await client.query(insertSql, [
      shopId,
      jobType,
      isRecurring,
      scheduleCron,
      scheduleTz,
      idempotencyKey,
      sourcePath,
      filterConfig ? JSON.stringify(filterConfig) : null,
      JSON.stringify(inputPayload),
      inputMeta ? JSON.stringify(inputMeta) : null,
    ]);

    const bulkJobId = rows[0].id;

    // 2) Update status → queued, set queued_at
    const updateSql = `
      UPDATE bulk_jobs
      SET status = 'queued',
          queued_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
    `;
    await client.query(updateSql, [bulkJobId]);

    await client.query("COMMIT");

    // 3) Enqueue BullMQ job (outside transaction)
    await bulkEditQueuePg.add(
      "run-bulk-edit",
      { bulkJobId },
      {
        removeOnComplete: 1000,
        removeOnFail: 1000,
        attempts: 3,             // extra safety; DB has max_attempts too
        backoff: {
          type: "exponential",
          delay: 1000,
        },
      }
    );

    logger.info("[bulkEditService.pg] Created bulk job", {
      shopId,
      bulkJobId,
      jobType,
    });

    return { bulkJobId };
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error("[bulkEditService.pg] Failed to create bulk job", {
      shopId,
      jobType,
      err,
    });
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Cancel a bulk job (best-effort).
 *
 * @param {number} shopId
 * @param {number} bulkJobId
 */
export async function cancelBulkEditJobPg(shopId, bulkJobId) {
  const sql = `
    UPDATE bulk_jobs
    SET status = 'canceled',
        canceled_at = NOW(),
        cancel_reason = COALESCE(cancel_reason, 'User requested'),
        updated_at = NOW()
    WHERE id = $1
      AND shop_id = $2
      AND status IN ('pending', 'queued', 'running')
    RETURNING id, status
  `;

  const { rows } = await pool.query(sql, [bulkJobId, shopId]);
  if (!rows.length) {
    return { canceled: false };
  }

  logger.info("[bulkEditService.pg] Canceled bulk job", {
    shopId,
    bulkJobId,
  });

  return { canceled: true };
}

/**
 * Fetch a single bulk job for a shop.
 *
 * @param {number} shopId
 * @param {number} bulkJobId
 */
export async function getBulkJobPg(shopId, bulkJobId) {
  const sql = `
    SELECT *
    FROM bulk_jobs
    WHERE id = $1
      AND shop_id = $2
  `;
  const { rows } = await pool.query(sql, [bulkJobId, shopId]);
  return rows[0] || null;
}

/**
 * List bulk jobs for a shop (for history page).
 *
 * @param {number} shopId
 * @param {Object} [opts]
 * @param {number} [opts.limit]
 * @param {number} [opts.offset]
 */
export async function listBulkJobsPg(shopId, opts = {}) {
  const limit = Math.max(1, Math.min(opts.limit || 50, 200));
  const offset = Math.max(0, opts.offset || 0);

  const sql = `
    SELECT *
    FROM bulk_jobs
    WHERE shop_id = $1
    ORDER BY created_at DESC
    LIMIT $2 OFFSET $3
  `;

  const { rows } = await pool.query(sql, [shopId, limit, offset]);

  return rows;
}