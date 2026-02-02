// FILE: web/Workers/snapshotCreateWorker.ts

import { Worker, Job } from "bullmq";
import { prisma } from "../db/prisma.js";
import logger from "../../utils/loggerUtils.js";
import { buildSnapshotBulkQuery } from "../lib/shopify/bulk-query-builder.js";
import {
  type FilterKey,
  type FilterOperator,
} from "../lib/filters/registry.js";
import { shopifyGraphqlRequest, shopifyFetchBulkResultStream } from "../../lib/shopify/client"; // you'll provide these

const SNAPSHOT_CREATE_QUEUE =
  process.env.SNAPSHOT_CREATE_QUEUE || "snapshot-create";

export type SnapshotFilterPayload = {
  key: FilterKey;
  operator: FilterOperator;
  value: any;
};

export interface SnapshotCreateJobData {
  shopId: string;
  shopDomain: string;
  snapshotRunId: string;
  candidateProductIds: string[]; // Shopify product IDs
  filters: SnapshotFilterPayload[]; // only SNAPSHOT-plane filters
}

/**
 * SnapshotRun.status enum you likely have in Prisma:
 *   QUEUED | RUNNING | INGESTING | COMPLETED | FAILED
 * We'll mirror those here.
 */
type SnapshotRunStatus =
  | "QUEUED"
  | "RUNNING"
  | "INGESTING"
  | "COMPLETED"
  | "FAILED";

export const snapshotCreateWorker = new Worker<SnapshotCreateJobData>(
  SNAPSHOT_CREATE_QUEUE,
  async (job: Job<SnapshotCreateJobData>) => {
    const { shopId, shopDomain, snapshotRunId, candidateProductIds, filters } =
      job.data;

    logger.info(
      { jobId: job.id, snapshotRunId, shopId },
      "[snapshotCreateWorker] Start",
    );

    // 1. Load SnapshotRun row to determine current state
    const run = await prisma.snapshotRun.findUnique({
      where: { id: snapshotRunId },
    });

    if (!run) {
      logger.error(
        { snapshotRunId },
        "[snapshotCreateWorker] SnapshotRun not found, failing job.",
      );
      return;
    }

    const status = run.status as SnapshotRunStatus;

    switch (status) {
      case "QUEUED":
        await handleQueued(job, run, shopDomain, candidateProductIds, filters);
        break;
      case "RUNNING":
        await handleRunning(job, run, shopDomain);
        break;
      case "INGESTING":
        await handleIngesting(job, run, shopDomain, shopId);
        break;
      case "COMPLETED":
        logger.info(
          { snapshotRunId },
          "[snapshotCreateWorker] SnapshotRun already COMPLETED, nothing to do.",
        );
        break;
      case "FAILED":
        logger.warn(
          { snapshotRunId },
          "[snapshotCreateWorker] SnapshotRun is FAILED, skipping.",
        );
        break;
      default:
        logger.warn(
          { snapshotRunId, status },
          "[snapshotCreateWorker] Unknown status, marking FAILED.",
        );
        await prisma.snapshotRun.update({
          where: { id: snapshotRunId },
          data: { status: "FAILED", errorMessage: "Unknown status in worker." },
        });
        break;
    }
  },
  {
    concurrency: Number(process.env.SNAPSHOT_CREATE_CONCURRENCY || 3),
  },
);

// --- State Handlers ---

async function handleQueued(
  job: Job<SnapshotCreateJobData>,
  run: any,
  shopDomain: string,
  candidateProductIds: string[],
  filters: SnapshotFilterPayload[],
) {
  const snapshotFilterKeys = filters.map((f) => f.key);

  // 1. Build dynamic Bulk Operation query
  const bulkMutation = buildSnapshotBulkQuery(
    snapshotFilterKeys,
    candidateProductIds,
  );

  // 2. Kick off Bulk Operation via Shopify GraphQL
  const bulkResp = await shopifyGraphqlRequest<{
    bulkOperationRunQuery: {
      bulkOperation: { id: string; status: string } | null;
      userErrors: { field: string[] | null; message: string }[];
    };
  }>(shopDomain, bulkMutation);

  const runQuery = bulkResp.bulkOperationRunQuery;
  if (!runQuery) {
    await markRunFailed(run.id, "bulkOperationRunQuery missing in response");
    return;
  }

  if (runQuery.userErrors && runQuery.userErrors.length > 0) {
    const msg = runQuery.userErrors
      .map((e) => e.message)
      .join("; ");
    await markRunFailed(run.id, `Shopify Bulk error(s): ${msg}`);
    return;
  }

  const bulkOp = runQuery.bulkOperation;
  if (!bulkOp) {
    await markRunFailed(run.id, "No bulkOperation returned from Shopify");
    return;
  }

  // 3. Store bulk operation ID & mark as RUNNING
  await prisma.snapshotRun.update({
    where: { id: run.id },
    data: {
      status: "RUNNING",
      bulkOperationId: bulkOp.id,
      bulkOperationStatus: bulkOp.status,
    },
  });

  // 4. Requeue job after short delay to poll status
  await job.updateProgress({ step: "RUNNING" });
  await job.moveToDelayed(Date.now() + getPollDelayMs(bulkOp.status));
}

async function handleRunning(
  job: Job<SnapshotCreateJobData>,
  run: any,
  shopDomain: string,
) {
  if (!run.bulkOperationId) {
    await markRunFailed(run.id, "RUNNING without bulkOperationId");
    return;
  }

  // 1. Poll Shopify for bulk operation status
  const statusQuery = `
    query {
      currentBulkOperation {
        id
        status
        errorCode
        url
        objectCount
        createdAt
        completedAt
      }
    }
  `;

  const resp = await shopifyGraphqlRequest<{
    currentBulkOperation: {
      id: string;
      status: string;
      errorCode: string | null;
      url: string | null;
      objectCount: string | null;
    } | null;
  }>(shopDomain, statusQuery);

  const op = resp.currentBulkOperation;

  if (!op || op.id !== run.bulkOperationId) {
    // Could be that the operation disappeared / replaced
    await markRunFailed(run.id, "Bulk operation not found or mismatched ID");
    return;
  }

  const status = op.status as SnapshotRunStatus | string;

  // 2. Update SnapshotRun record
  await prisma.snapshotRun.update({
    where: { id: run.id },
    data: {
      bulkOperationStatus: op.status,
      bulkOperationUrl: op.url,
      bulkOperationErrorCode: op.errorCode,
    },
  });

  if (status === "COMPLETED") {
    if (!op.url) {
      await markRunFailed(run.id, "Bulk operation COMPLETED but url is null");
      return;
    }

    // Move to INGESTING phase
    await prisma.snapshotRun.update({
      where: { id: run.id },
      data: {
        status: "INGESTING",
      },
    });

    await job.updateProgress({ step: "INGESTING" });
    // Requeue immediately for ingesting
    await job.moveToDelayed(Date.now() + 1000);
    return;
  }

  if (status === "FAILED") {
    await markRunFailed(
      run.id,
      op.errorCode
        ? `Shopify bulk operation failed: ${op.errorCode}`
        : "Shopify bulk operation failed",
    );
    return;
  }

  // Still running / created / pending → requeue with backoff
  await job.updateProgress({ step: "RUNNING", bulkStatus: op.status });
  await job.moveToDelayed(Date.now() + getPollDelayMs(op.status));
}

async function handleIngesting(
  job: Job<SnapshotCreateJobData>,
  run: any,
  shopDomain: string,
  shopId: string,
) {
  if (!run.bulkOperationUrl) {
    await markRunFailed(run.id, "INGESTING without bulkOperationUrl");
    return;
  }

  // 1. Stream JSONL from bulkOperation URL
  const stream = await shopifyFetchBulkResultStream(shopDomain, run.bulkOperationUrl);

  // 2. Parse & upsert into SnapshotProduct in batches
  const BATCH_SIZE = 1000;
  const buffer: any[] = [];

  for await (const line of stream) {
    const trimmed = String(line).trim();
    if (!trimmed) continue;

    // Each line is a JSON object representing a product node
    const obj = JSON.parse(trimmed);

    // Expect shape: { id, handle, descriptionHtml?, seo? { title, description } }
    const productId = obj.id as string;
    const handle = obj.handle as string | undefined;
    const descriptionHtml = obj.descriptionHtml as string | undefined;
    const seoTitle = obj.seo?.title as string | undefined;
    const seoDescription = obj.seo?.description as string | undefined;

    buffer.push({
      shopId,
      productId,
      snapshotRunId: run.id,
      handle,
      description: descriptionHtml ?? null,
      seoTitle: seoTitle ?? null,
      seoDescription: seoDescription ?? null,
    });

    if (buffer.length >= BATCH_SIZE) {
      await flushSnapshotBatch(buffer.splice(0, buffer.length));
    }
  }

  if (buffer.length > 0) {
    await flushSnapshotBatch(buffer);
  }

  // 3. Mark SnapshotRun as COMPLETED
  await prisma.snapshotRun.update({
    where: { id: run.id },
    data: {
      status: "COMPLETED",
    },
  });

  await job.updateProgress({ step: "COMPLETED" });
  // Done: job completes, no requeue.
}

// --- Helper Functions ---

async function flushSnapshotBatch(rows: any[]) {
  if (!rows.length) return;

  // Use createMany with skipDuplicates to avoid double-insert
  await prisma.snapshotProduct.createMany({
    data: rows.map((r) => ({
      shopId: r.shopId,
      productId: r.productId,
      snapshotRunId: r.snapshotRunId,
      handle: r.handle,
      description: r.description,
      seoTitle: r.seoTitle,
      seoDescription: r.seoDescription,
    })),
    skipDuplicates: true,
  });
}

async function markRunFailed(runId: string, message: string) {
  await prisma.snapshotRun.update({
    where: { id: runId },
    data: {
      status: "FAILED",
      errorMessage: message,
    },
  });
}

function getPollDelayMs(status: string): number {
  // You can tune this however you like:
  // - initial: small, then longer as job runs
  // For now: 5s default, 10–20s after RUNNING
  switch (status) {
    case "CREATED":
    case "PENDING":
      return 5000;
    case "RUNNING":
      return 10000;
    default:
      return 5000;
  }
}
