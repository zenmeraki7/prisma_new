// FILE: web/workers/processBulkEdit.worker.js

import fs from "node:fs/promises";
import { Queue, Worker } from "bullmq";

import {
  getBulkEditJobInternalById,
  updateBulkEditJob,
  markBulkEditJobFailed,
} from "../../repositories/bulkEdit.repository.js";
import { getBulkEditPlanOrThrow } from "../../services/bulkEdit/bulkEditPlanner.service.js";
import { streamBulkEditJsonlFromDb } from "../../services/bulkEdit/bulkEditStreamingJsonlBuilder.service.js";
import { createAndUploadBulkMutationJsonl } from "../../services/shopify/bulkEdit/stagedUpload.service.js";
import {
  runBulkMutation,
  mapShopifyBulkStatusToLocalStatus,
} from "../../services/shopify/bulkEdit/bulkOperation.service.js";

export const BULK_EDIT_QUEUE_NAME = "bulk-edit";

function getRedisConnection() {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    return {
      host: "127.0.0.1",
      port: 6379,
      maxRetriesPerRequest: null,
    };
  }

  const url = new URL(redisUrl);

  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    tls: url.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

const connection = getRedisConnection();

export const bulkEditQueue = new Queue(BULK_EDIT_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

function buildSelectionFromJob(bulkJob) {
  // New schema path
  if (bulkJob.selectionMode) {
    if (bulkJob.selectionMode.endsWith("_WHERE")) {
      return {
        mode: bulkJob.selectionMode,
        where: bulkJob.compiledWhereJson,
        ids: null,
      };
    }

    if (bulkJob.selectionMode.endsWith("_IDS")) {
      return {
        mode: bulkJob.selectionMode,
        ids: bulkJob.filterExprJson?.ids ?? [],
        where: null,
      };
    }
  }

  // Backward-compatible legacy path
  if (bulkJob.filterExprJson?.mode) {
    return {
      mode: bulkJob.filterExprJson.mode,
      where: bulkJob.filterExprJson.where ?? null,
      ids: bulkJob.filterExprJson.ids ?? null,
    };
  }

  throw new Error(`BulkEditJob ${bulkJob.id} is missing selection metadata`);
}

function buildPlannerPayload(bulkJob, selection) {
  return {
    scope: bulkJob.scope,
    fieldKey: bulkJob.fieldKey,
    action: bulkJob.action,
    value: bulkJob.editPayloadJson?.value,
    selection,
    filterExpr: bulkJob.rawFilterExprJson ?? null,
  };
}

function normalizeBigIntForPrisma(value) {
  if (value == null) return null;
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value === "string" && value.trim() !== "") return BigInt(value);
  return null;
}

async function markJobBuildStarted({ jobId, bulkJob }) {
  await updateBulkEditJob({
    jobId,
    data: {
      status: "BUILDING",
      startedAt: bulkJob.startedAt ?? new Date(),
    },
  });
}

async function markJobEmpty({ jobId }) {
  await updateBulkEditJob({
    jobId,
    data: {
      status: "COMPLETED",
      selectedCount: 0,
      inputLineCount: 0,
      completedAt: new Date(),
      errorMessage: null,
    },
  });
}

async function markJobUploading({
  jobId,
  built,
}) {
  await updateBulkEditJob({
    jobId,
    data: {
      status: "UPLOADING",
      selectedCount: built.selectedCount,
      inputLineCount: built.inputLineCount,
      fileSizeBytes: normalizeBigIntForPrisma(built.fileSizeBytes),
      errorMessage: null,
    },
  });
}

async function markJobSubmitted({
  jobId,
  built,
  uploaded,
  bulkOperation,
  plan,
}) {
  const localStatus = mapShopifyBulkStatusToLocalStatus(bulkOperation.status);

  await updateBulkEditJob({
    jobId,
    data: {
      status: localStatus,
      mutationName: plan.mutationName,
      stagedUploadPath: uploaded.stagedUploadPath,
      stagedResourceUrl: uploaded.resourceUrl,
      bulkOperationId: bulkOperation.id,
      resultUrl: bulkOperation.url ?? null,
      partialDataUrl: bulkOperation.partialDataUrl ?? null,
      objectCount:
        bulkOperation.objectCount != null
          ? Number(bulkOperation.objectCount)
          : null,
      fileSizeBytes:
        bulkOperation.fileSize != null
          ? normalizeBigIntForPrisma(bulkOperation.fileSize)
          : normalizeBigIntForPrisma(built.fileSizeBytes),
      errorCode: bulkOperation.errorCode ?? null,
      completedAt:
        localStatus === "COMPLETED" || localStatus === "FAILED"
          ? new Date()
          : null,
      errorMessage:
        localStatus === "FAILED"
          ? bulkOperation.errorCode || "Bulk operation failed"
          : null,
    },
  });

  return localStatus;
}

export async function processBulkEditJob(job) {
  const { shopId, jobId } = job.data || {};

  if (!shopId || !jobId) {
    throw new Error("Missing shopId or jobId in worker payload");
  }

  let jsonlFilePath = null;

  try {
    const bulkJob = await getBulkEditJobInternalById(jobId);
    if (!bulkJob) {
      throw new Error(`BulkEditJob not found: ${jobId}`);
    }

    const selection = buildSelectionFromJob(bulkJob);
    const plannerPayload = buildPlannerPayload(bulkJob, selection);
    const plan = getBulkEditPlanOrThrow(plannerPayload);

    await markJobBuildStarted({
      jobId,
      bulkJob,
    });

    const built = await streamBulkEditJsonlFromDb({
      jobId,
      shopId,
      scope: bulkJob.scope,
      selection,
      plan,
      value: bulkJob.editPayloadJson?.value,
    });

    jsonlFilePath = built.filePath;

    if (!built.selectedCount) {
      await markJobEmpty({ jobId });

      return {
        ok: true,
        jobId,
        selectedCount: 0,
        inputLineCount: 0,
        message: "No matching rows",
      };
    }

    await markJobUploading({
      jobId,
      built,
    });

    const uploaded = await createAndUploadBulkMutationJsonl({
      shop: shopId,
      filePath: built.filePath,
      filename: built.filename,
    });

    const bulkOperation = await runBulkMutation({
      shop: shopId,
      mutation: plan.mutation,
      stagedUploadPath: uploaded.stagedUploadPath,
    });

    const localStatus = await markJobSubmitted({
      jobId,
      built,
      uploaded,
      bulkOperation,
      plan,
    });

    return {
      ok: true,
      jobId,
      bulkOperationId: bulkOperation.id,
      status: localStatus,
      selectedCount: built.selectedCount,
      inputLineCount: built.inputLineCount,
      fileSizeBytes: built.fileSizeBytes,
    };
  } catch (error) {
    await markBulkEditJobFailed({
      jobId,
      errorMessage: error?.message || "Unknown worker error",
    });

    throw error;
  } finally {
    if (jsonlFilePath) {
      await fs.unlink(jsonlFilePath).catch(() => {});
    }
  }
}

/**
 * Start a dedicated worker only in worker processes.
 *
 * Example:
 * RUN_BULK_EDIT_WORKER=1 node web/index.js
 * or use a dedicated worker entrypoint that imports this file.
 */
export const bulkEditWorker =
  process.env.RUN_BULK_EDIT_WORKER === "1"
    ? new Worker(BULK_EDIT_QUEUE_NAME, processBulkEditJob, {
        connection,
        concurrency: Number(process.env.BULK_EDIT_WORKER_CONCURRENCY || 2),
      })
    : null;

if (bulkEditWorker) {
  bulkEditWorker.on("completed", (job, result) => {
    console.log("[bulk-edit-worker] completed", {
      queueJobId: job.id,
      result,
    });
  });

  bulkEditWorker.on("failed", (job, error) => {
    console.error("[bulk-edit-worker] failed", {
      queueJobId: job?.id,
      error: error?.message,
    });
  });

  bulkEditWorker.on("error", (error) => {
    console.error("[bulk-edit-worker] worker error", {
      error: error?.message,
    });
  });
}