// FILE: web/services/bulkService/bulkEditWorker.pg.js

import { Worker } from "bullmq";
import { redis } from "../../queues/redisConnection.js";
import { pool } from "../../db/postgres/pool.js";
import logger from "../../utils/logger.server.js";

import {
  buildProductListQuery,
  buildVariantListQuery,
} from "../productService/productFilterService.pg.js";

import { BULK_EDIT_PG_QUEUE } from "./bulkEditService.pg.js";

import { applyProductBulkOps } from "../shopify/productUpdateHelpers.js";
import { applyVariantBulkOps } from "../shopify/variantUpdateHelpers.js";
import { applyInventoryBulkOps } from "../shopify/inventoryUpdateHelpers.js";

import {
  getShopSessionForShopId,
} from "../shopify/shopSessionService.pg.js";

const WORKER_NAME = "bulk-edit-pg-worker";
const TARGET_PAGE_SIZE = 500;
const MAX_TARGET_PAGES = 2000;

export const bulkEditPgWorker = new Worker(
  BULK_EDIT_PG_QUEUE,
  async (job) => runBulkEditJob(job),
  {
    connection: redis,
    concurrency: 3,
  }
);

async function runBulkEditJob(job) {
  const { bulkJobId } = job.data || {};
  if (!bulkJobId) return;

  const client = await pool.connect();

  try {
    const jobRow = await lockBulkJobRow(client, bulkJobId);
    if (!jobRow) return;

    const {
      shop_id: shopId,
      input_filters,
      input_payload,
      target_level,
    } = jobRow;

    const hasOtherRunning = await hasConcurrentRunningJob(
      client,
      shopId,
      bulkJobId
    );
    if (hasOtherRunning) {
      throw new Error("Another bulk job already running for this shop");
    }

    const session = await getShopSessionForShopId(shopId);

    let totalProcessed = 0;
    let totalSucceeded = 0;
    let totalFailed = 0;

    let page = 1;

    while (page <= MAX_TARGET_PAGES) {
      const { rows, rowCount } = await fetchTargetPage(client, {
        shopId,
        filterConfig: input_filters,
        targetLevel: target_level,
        page,
        pageSize: TARGET_PAGE_SIZE,
      });

      if (rowCount === 0) break;

      const result = await applyEditsForPage({
        client,
        session,
        shopId,
        bulkJobId,
        targetLevel: target_level,
        targets: rows,
        payload: input_payload,
      });

      totalProcessed += result.processed;
      totalSucceeded += result.succeeded;
      totalFailed += result.failed;

      await job.updateProgress({
        page,
        processed: totalProcessed,
        succeeded: totalSucceeded,
        failed: totalFailed,
      });

      if (rowCount < TARGET_PAGE_SIZE) break;
      page++;
    }

    await markBulkJobCompleted(client, bulkJobId, {
      totalProcessed,
      totalSucceeded,
      totalFailed,
    });

    logger.info("[bulkEditWorker.pg] Completed", { bulkJobId });
  } catch (err) {
    logger.error("[bulkEditWorker.pg] Failed", { bulkJobId, err });
    await markBulkJobFailed(pool, bulkJobId, err);
    throw err;
  } finally {
    client.release();
  }
}

async function fetchTargetPage(client, {
  shopId,
  filterConfig,
  targetLevel,
  page,
  pageSize,
}) {
  const query =
    targetLevel === "VARIANT"
      ? buildVariantListQuery({
          shopId,
          filterConfig,
          page,
          pageSize,
        })
      : buildProductListQuery({
          shopId,
          filterConfig,
          page,
          pageSize,
        });

  const res = await client.query(query.text, query.values);
  return { rows: res.rows, rowCount: res.rowCount };
}

async function applyEditsForPage({
  client,
  session,
  shopId,
  bulkJobId,
  targetLevel,
  targets,
  payload,
}) {
  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  for (const target of targets) {
    processed++;

    try {
      if (targetLevel === "PRODUCT") {
        await applyProductBulkOps({
          session,
          product: target,
          payload,
        });
      }

      if (targetLevel === "VARIANT") {
        await applyVariantBulkOps({
          session,
          variant: target,
          payload,
        });

        if (payload?.operations?.some(op =>
          op.fieldKey?.startsWith("VARIANT_INVENTORY_")
        )) {
          await applyInventoryBulkOps({
            session,
            variant: target,
            payload,
          });
        }
      }

      await recordEditHistory(client, {
        shopId,
        bulkJobId,
        target,
        targetLevel,
        payload,
      });

      succeeded++;
    } catch (err) {
      failed++;
      logger.error("[bulkEditWorker.pg] Target failed", {
        bulkJobId,
        targetId: target.id,
        err,
      });
    }
  }

  return { processed, succeeded, failed };
}

/* ───────────────── DB HELPERS ───────────────── */

async function lockBulkJobRow(client, bulkJobId) {
  await client.query("BEGIN");

  const { rows } = await client.query(
    `SELECT * FROM bulk_jobs WHERE id = $1 FOR UPDATE`,
    [bulkJobId]
  );

  if (!rows.length) {
    await client.query("ROLLBACK");
    return null;
  }

  const row = rows[0];

  if (["completed", "failed", "canceled"].includes(row.status)) {
    await client.query("ROLLBACK");
    return null;
  }

  const now = new Date();

  const { rows: updated } = await client.query(
    `UPDATE bulk_jobs
     SET status='running',
         started_at=COALESCE(started_at,$2),
         locked_by=$3,
         locked_at=$2,
         attempt=attempt+1,
         updated_at=$2
     WHERE id=$1
     RETURNING *`,
    [bulkJobId, now, WORKER_NAME]
  );

  await client.query("COMMIT");
  return updated[0];
}

async function hasConcurrentRunningJob(client, shopId, bulkJobId) {
  const { rows } = await client.query(
    `SELECT 1 FROM bulk_jobs
     WHERE shop_id=$1
     AND id<>$2
     AND status='running'
     LIMIT 1`,
    [shopId, bulkJobId]
  );
  return rows.length > 0;
}

async function markBulkJobCompleted(client, bulkJobId, stats) {
  await client.query(
    `UPDATE bulk_jobs
     SET status='completed',
         finished_at=NOW(),
         stats=$2,
         updated_at=NOW()
     WHERE id=$1`,
    [bulkJobId, stats]
  );
}

async function markBulkJobFailed(poolOrClient, bulkJobId, err) {
  await poolOrClient.query(
    `UPDATE bulk_jobs
     SET status='failed',
         finished_at=NOW(),
         error_summary=$2,
         updated_at=NOW()
     WHERE id=$1`,
    [bulkJobId, err.message]
  );
}

async function recordEditHistory(client, {
  shopId,
  bulkJobId,
  target,
  targetLevel,
  payload,
}) {
  await client.query(
    `INSERT INTO edit_history (
      shop_id,
      bulk_job_id,
      shopify_product_id,
      shopify_variant_id,
      target_level,
      field,
      new_value,
      edit_type,
      meta
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,'bulk',$8::jsonb)`,
    [
      shopId,
      bulkJobId,
      target.shopify_product_id || null,
      target.shopify_variant_id || null,
      targetLevel,
      "__bulk_payload",
      JSON.stringify(payload),
      JSON.stringify({ appliedAt: new Date() }),
    ]
  );
}