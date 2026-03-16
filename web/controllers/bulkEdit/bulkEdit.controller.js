// FILE: web/controllers/bulkEdit.controller.js

import crypto from "node:crypto";

import { compileFastWhere } from "../lib/filters/fastCompiler";
import { compileFastVariantWhere } from "../lib/filters/fastVariantCompiler";
import { prisma } from "../db/prisma.js";
import {
  createBulkEditJob,
  getBulkEditJobById,
  updateBulkEditJob,
} from "../repositories/bulkEdit.repository.js";
import {
  getBulkEditPlanOrThrow,
  normalizeBulkEditPayload,
} from "../services/bulkEdit/bulkEditPlanner.service.js";
import {
  bulkEditQueue,
  BULK_EDIT_QUEUE_NAME,
} from "../workers/processBulkEdit.worker.js";
import {
  getBulkOperationById,
  mapShopifyBulkStatusToLocalStatus,
} from "../services/shopify/bulkOperation.service.js";

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

function badRequest(res, message, details = undefined) {
  return res.status(400).json({
    ok: false,
    error: message,
    details,
  });
}

function hashIdempotency(payload) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}

async function validateCompiledWhere({ scope, where }) {
  if (scope === "PRODUCT") {
    await prisma.productLite.findFirst({
      where,
      select: { id: true },
    });
    return;
  }

  if (scope === "VARIANT") {
    await prisma.variantLite.findFirst({
      where,
      select: { variantId: true },
    });
    return;
  }

  throw new Error(`Unknown scope "${scope}"`);
}

function buildCompiledSelection({ scope, shopId, rawFilterExpr, incomingSelection }) {
  if (incomingSelection?.mode?.endsWith("_IDS")) {
    return {
      mode: incomingSelection.mode,
      ids: incomingSelection.ids ?? [],
      where: null,
    };
  }

  if (incomingSelection?.where) {
    return {
      mode: incomingSelection.mode,
      where: incomingSelection.where,
      ids: null,
    };
  }

  if (!rawFilterExpr) {
    throw new Error(
      "Either filterExpr or selection.where / selection.ids must be provided",
    );
  }

  if (scope === "PRODUCT") {
    return {
      mode: "PRODUCT_WHERE",
      where: compileFastWhere(rawFilterExpr, { shopId }),
      ids: null,
    };
  }

  if (scope === "VARIANT") {
    return {
      mode: "VARIANT_WHERE",
      where: compileFastVariantWhere(rawFilterExpr, { shopId }),
      ids: null,
    };
  }

  throw new Error(`Unsupported scope "${scope}"`);
}

/**
 * POST /api/bulk-edit/jobs
 *
 * Preferred request shape:
 * {
 *   scope: "PRODUCT" | "VARIANT",
 *   fieldKey: "...",
 *   action: "SET",
 *   value: ...,
 *   filterExpr: {...}, // raw DSL
 *   selection?: {
 *     mode?: "PRODUCT_WHERE" | "VARIANT_WHERE" | "PRODUCT_IDS" | "VARIANT_IDS",
 *     where?: {...},
 *     ids?: string[]
 *   }
 * }
 */
export async function createBulkEditJobController(req, res) {
  try {
    const shopId = extractShop(req);
    if (!shopId) {
      return badRequest(res, "Missing shop");
    }

    const normalized = normalizeBulkEditPayload(req.body ?? {});
    const plan = getBulkEditPlanOrThrow(normalized);

    const compiledSelection = buildCompiledSelection({
      scope: normalized.scope,
      shopId,
      rawFilterExpr: normalized.filterExpr,
      incomingSelection: normalized.selection,
    });

    if (compiledSelection.mode?.endsWith("_WHERE")) {
      await validateCompiledWhere({
        scope: normalized.scope,
        where: compiledSelection.where,
      });
    }

    const idempotencyKey = hashIdempotency({
      shopId,
      scope: normalized.scope,
      fieldKey: normalized.fieldKey,
      action: normalized.action,
      value: normalized.value,
      selectionMode: compiledSelection.mode,
      where: compiledSelection.where,
      ids: compiledSelection.ids,
    });

    const job = await createBulkEditJob({
      shopId,
      scope: normalized.scope,
      action: normalized.action,
      fieldKey: normalized.fieldKey,
      filterExprJson: compiledSelection, // backward compat
      rawFilterExprJson: normalized.filterExpr ?? null,
      compiledWhereJson: compiledSelection.where ?? null,
      selectionMode: compiledSelection.mode,
      editPayloadJson: {
        value: normalized.value,
      },
      idempotencyKey,
      mutationName: plan.mutationName,
    });

    await bulkEditQueue.add(
      BULK_EDIT_QUEUE_NAME,
      {
        shopId,
        jobId: job.id,
      },
      {
        jobId: `bulk-edit:${job.id}`,
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
      job: {
        id: job.id,
        status: job.status,
        scope: job.scope,
        action: job.action,
        fieldKey: job.fieldKey,
        mutationName: job.mutationName,
        selectionMode: job.selectionMode ?? compiledSelection.mode,
      },
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message || "Failed to create bulk edit job",
    });
  }
}

/**
 * GET /api/bulk-edit/jobs/:id
 */
export async function getBulkEditJobController(req, res) {
  try {
    const shopId = extractShop(req);
    const jobId = req.params?.id;

    if (!shopId) return badRequest(res, "Missing shop");
    if (!jobId) return badRequest(res, "Missing job id");

    let job = await getBulkEditJobById({ shopId, jobId });
    if (!job) {
      return res.status(404).json({
        ok: false,
        error: "Bulk edit job not found",
      });
    }

    if (job.bulkOperationId && ["SUBMITTED", "RUNNING"].includes(job.status)) {
      const remote = await getBulkOperationById({
        shop: shopId,
        bulkOperationId: job.bulkOperationId,
      });

      if (remote) {
        const nextStatus = mapShopifyBulkStatusToLocalStatus(remote.status);

        const patch = {
          status: nextStatus,
          resultUrl: remote.url ?? job.resultUrl,
          partialDataUrl: remote.partialDataUrl ?? job.partialDataUrl,
          objectCount:
            remote.objectCount != null
              ? Number(remote.objectCount)
              : job.objectCount,
          fileSizeBytes:
            remote.fileSize != null ? BigInt(remote.fileSize) : job.fileSizeBytes,
          errorCode: remote.errorCode ?? job.errorCode,
        };

        if (nextStatus === "COMPLETED" || nextStatus === "FAILED") {
          patch.completedAt = new Date();
        }

        job = await updateBulkEditJob({
          jobId,
          shopId,
          data: patch,
        });
      }
    }

    return res.status(200).json({
      ok: true,
      job,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message || "Failed to load bulk edit job",
    });
  }
}