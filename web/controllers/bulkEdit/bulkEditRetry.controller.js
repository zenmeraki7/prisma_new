// Retry failed rows only endpoint

// FILE: web/controllers/bulkEditRetry.controller.js

import crypto from "node:crypto";

import {
  getBulkEditJobById,
  createBulkEditJob,
  listAllFailedBulkEditJobItems,
} from "../../repositories/bulkEdit.repository.js";
import {
  bulkEditQueue,
  BULK_EDIT_QUEUE_NAME,
} from "../../workers/bulkEdit/processBulkEdit.worker.js";

function extractShop(req) {
  return (
    req?.shop ||
    req?.query?.shop ||
    req?.body?.shop ||
    req?.params?.shop ||
    req?.session?.shop ||
    req?.locals?.shop ||
    req?.res?.locals?.shopify?.session?.shop ||
    req?.res?.locals?.session?.shop ||
    null
  );
}

function hashIdempotency(payload) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}

/**
 * POST /api/bulk-edit/jobs/:id/retry-failed
 */
export async function retryFailedBulkEditJobController(req, res) {
  try {
    const shopId = extractShop(req);
    const sourceJobId = req.params?.id;

    if (!shopId || !sourceJobId) {
      return res.status(400).json({
        ok: false,
        error: "Missing shop or job id",
      });
    }

    const sourceJob = await getBulkEditJobById({
      shopId,
      jobId: sourceJobId,
    });

    if (!sourceJob) {
      return res.status(404).json({
        ok: false,
        error: "Source bulk edit job not found",
      });
    }

    const failedItems = await listAllFailedBulkEditJobItems({
      jobId: sourceJobId,
      shopId,
    });

    if (!failedItems.length) {
      return res.status(400).json({
        ok: false,
        error: "No failed rows found for this job",
      });
    }

    let selectionMode;
    let ids;

    if (sourceJob.scope === "PRODUCT") {
      selectionMode = "PRODUCT_IDS";
      ids = [
        ...new Set(
          failedItems
            .map((item) => item.productId)
            .filter(Boolean),
        ),
      ];
    } else {
      selectionMode = "VARIANT_IDS";
      ids = [
        ...new Set(
          failedItems
            .map((item) => item.variantId)
            .filter(Boolean),
        ),
      ];
    }

    if (!ids.length) {
      return res.status(400).json({
        ok: false,
        error:
          "Failed items do not contain local retryable IDs. Persist productId/variantId during build first.",
      });
    }

    const idempotencyKey = hashIdempotency({
      retryOf: sourceJob.id,
      shopId,
      selectionMode,
      ids,
      fieldKey: sourceJob.fieldKey,
      action: sourceJob.action,
      value: sourceJob.editPayloadJson?.value,
    });

    const retryJob = await createBulkEditJob({
      shopId,
      scope: sourceJob.scope,
      action: sourceJob.action,
      fieldKey: sourceJob.fieldKey,
      filterExprJson: {
        mode: selectionMode,
        ids,
      },
      rawFilterExprJson: sourceJob.rawFilterExprJson ?? null,
      compiledWhereJson: null,
      selectionMode,
      editPayloadJson: sourceJob.editPayloadJson,
      idempotencyKey,
      mutationName: sourceJob.mutationName,
    });

    await bulkEditQueue.add(
      BULK_EDIT_QUEUE_NAME,
      {
        shopId,
        jobId: retryJob.id,
      },
      {
        jobId: `bulk-edit:${retryJob.id}`,
        removeOnComplete: 100,
        removeOnFail: 500,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 5000,
        },
      },
    );

    return res.status(202).json({
      ok: true,
      retryJob: {
        id: retryJob.id,
        sourceJobId: sourceJob.id,
        selectionMode,
        retryCount: ids.length,
      },
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message || "Failed to create retry job",
    });
  }
}