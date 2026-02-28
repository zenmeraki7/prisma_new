// FILE: web/controllers/bulkService/bulkEditController.pg.js

import {
  createBulkEditJobPg,
  listBulkJobsPg,
  getBulkJobPg,
  cancelBulkEditJobPg,
} from "../../services/bulkService/bulkEditService.pg.js";
import logger from "../../utils/logger.server.js";
// import { validateAuthenticatedSession } from "../../shopify.js"; // wire in router if needed

/**
 * POST /api/pg/bulk/edit
 *
 * Body:
 * {
 *   jobType: "PRODUCT_BULK_EDIT" | "INVENTORY_BULK_EDIT" | ...,
 *   filterConfig?: FilterGroup,        // DSL filters
 *   inputPayload: { ... },             // fields to edit
 *   inputMeta?: {
 *     sourcePath?: string,             // e.g. "products/bulk-edit"
 *     userId?: string,
 *     [key: string]: any
 *   },
 *   isRecurring?: boolean,
 *   scheduleCron?: string | null,
 *   scheduleTz?: string | null,
 *   idempotencyKey?: string | null
 * }
 */
export async function createBulkEditJobController(req, res, next) {
  try {
    // You should already be attaching shopId from your Shopify auth/session.
    const shopId = req.shopId;
    if (!shopId) {
      return res.status(400).json({ error: "shopId missing on request context" });
    }

    const {
      jobType,
      filterConfig,
      inputPayload,
      inputMeta,
      isRecurring,
      scheduleCron,
      scheduleTz,
      idempotencyKey,
    } = req.body || {};

    if (!jobType) {
      return res.status(400).json({ error: "jobType is required" });
    }

    if (!inputPayload || typeof inputPayload !== "object") {
      return res.status(400).json({ error: "inputPayload is required and must be an object" });
    }

    const result = await createBulkEditJobPg({
      shopId,
      jobType,
      filterConfig: filterConfig || null,
      inputPayload,
      inputMeta: inputMeta || {},
      isRecurring: Boolean(isRecurring),
      scheduleCron: scheduleCron || null,
      scheduleTz: scheduleTz || null,
      idempotencyKey: idempotencyKey || null,
    });

    return res.status(201).json({
      bulkJobId: result.bulkJobId,
      status: "queued",
    });
  } catch (err) {
    logger.error("[bulkEditController.pg] Failed to create bulk edit job", {
      err,
      body: req.body,
      shopId: req.shopId,
    });
    next(err);
  }
}

/**
 * GET /api/pg/bulk/jobs
 *
 * Query:
 *  - limit?: number
 *  - offset?: number
 */
export async function listBulkJobsController(req, res, next) {
  try {
    const shopId = req.shopId;
    if (!shopId) {
      return res.status(400).json({ error: "shopId missing on request context" });
    }

    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const offset = req.query.offset ? Number(req.query.offset) : undefined;

    const jobs = await listBulkJobsPg(shopId, { limit, offset });

    return res.json({
      items: jobs,
      limit: limit ?? 50,
      offset: offset ?? 0,
    });
  } catch (err) {
    logger.error("[bulkEditController.pg] Failed to list bulk jobs", {
      err,
      shopId: req.shopId,
    });
    next(err);
  }
}

/**
 * GET /api/pg/bulk/jobs/:id
 */
export async function getBulkJobController(req, res, next) {
  try {
    const shopId = req.shopId;
    if (!shopId) {
      return res.status(400).json({ error: "shopId missing on request context" });
    }

    const id = Number(req.params.id);
    if (!id || Number.isNaN(id)) {
      return res.status(400).json({ error: "Invalid job id" });
    }

    const job = await getBulkJobPg(shopId, id);
    if (!job) {
      return res.status(404).json({ error: "Bulk job not found" });
    }

    return res.json(job);
  } catch (err) {
    logger.error("[bulkEditController.pg] Failed to fetch bulk job", {
      err,
      shopId: req.shopId,
      id: req.params.id,
    });
    next(err);
  }
}

/**
 * POST /api/pg/bulk/jobs/:id/cancel
 *
 * Body (optional):
 *  - reason?: string
 */
export async function cancelBulkJobController(req, res, next) {
  try {
    const shopId = req.shopId;
    if (!shopId) {
      return res.status(400).json({ error: "shopId missing on request context" });
    }

    const id = Number(req.params.id);
    if (!id || Number.isNaN(id)) {
      return res.status(400).json({ error: "Invalid job id" });
    }

    const { reason } = req.body || {};

    // First try cancel in DB
    const result = await cancelBulkEditJobPg(shopId, id);

    if (!result.canceled) {
      return res.status(409).json({
        canceled: false,
        error: "Job not cancellable (already finished or not found)",
      });
    }

    // Optionally: update cancel_reason if caller provided reason
    if (reason && typeof reason === "string" && reason.trim()) {
      await updateCancelReason(shopId, id, reason.trim());
    }

    return res.json({ canceled: true });
  } catch (err) {
    logger.error("[bulkEditController.pg] Failed to cancel bulk job", {
      err,
      shopId: req.shopId,
      id: req.params.id,
    });
    next(err);
  }
}

/**
 * Internal helper: store user-provided cancel reason.
 *
 * @param {number} shopId
 * @param {number} bulkJobId
 * @param {string} reason
 */
async function updateCancelReason(shopId, bulkJobId, reason) {
  // To avoid circular imports, do a direct query here:
  const { pool } = await import("../../db/postgres/pool.js");

  const sql = `
    UPDATE bulk_jobs
    SET cancel_reason = $3,
        updated_at = NOW()
    WHERE id = $1
      AND shop_id = $2
  `;

  await pool.query(sql, [bulkJobId, shopId, reason]);
}