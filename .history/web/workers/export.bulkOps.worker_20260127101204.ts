// web/workers/export.bulkOps.worker.ts
//
// Entrypoint + core logic for BulkOps-based export worker.
//
// Responsibilities:
//  - Attach BullMQ Worker to BulkOps export queue.
//  - Enforce per-shop concurrency caps via Redis lock.
//  - Use Shopify Bulk Operation with rate-limit–aware polling + retries.
//  - Build dynamic product selection set from fieldKeys (no over-fetch).
//  - Stream JSONL → CSV / JSON / XML using shared exportFieldMapper.
//
// NOTE:
//  - FILTERED scope uses filterJson → Shopify search via compileFilterToShopifySearch.
//  - SELECTED scope must not route to BulkOps (FAST-only).

import { Worker, Job } from "bullmq";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import fetch from "node-fetch";
import * as readline from "node:readline";
import { once } from "node:events";

import type { ExportJob as ExportJobModel } from "@prisma/client";

import { prisma } from "../db/prisma";
import { buildRedisConnection } from "../lib/jobs/redis";
import {
  EXPORT_BULK_OPS_QUEUE_NAME,
  type BulkExportJobPayload,
} from "../lib/jobs/queues/exportBulkOpsQueue";
import { getShopifyAdminClient } from "../lib/shopify/shopifyClient";
import { compileFilterToShopifySearch } from "../lib/filters/shopifySearchCompiler";

import {
  buildExportRecordFromShape,
  type ExportProductShape,
  type ExportVariantShape,
  VARIANT_FIELD_KEYS,
} from "../shared/export/exportFieldMapper";

const connection = buildRedisConnection();

/* ========================================================================== *
 * Basic helpers (filesystem, CSV/XML escaping)
 * ========================================================================== */

function getExportsBaseDir(): string {
  return process.env.EXPORTS_DIR || path.join(process.cwd(), "exports");
}

function ensureSafeFormatExt(format: "CSV" | "JSON" | "XML" | "XLSX"): string {
  switch (format) {
    case "CSV":
      return "csv";
    case "JSON":
      return "json";
    case "XML":
      return "xml";
    case "XLSX":
      return "xlsx";
    default:
      return "dat";
  }
}

function csvEscape(value: string): string {
  const v = value ?? "";
  if (v === "") return "";
  if (/[",\n\r]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/* ========================================================================== *
 * Shopify Bulk Operation with rate-limit awareness + retries
 * ========================================================================== */

type ThrottleStatus = {
  currentlyAvailable: number;
  restoreRate: number;
};

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Backoff based on Shopify cost throttleStatus.
 * We aim to keep at least ~50 points available.
 */
async function respectThrottle(status?: ThrottleStatus | null) {
  if (!status) return;
  const { currentlyAvailable, restoreRate } = status;

  if (currentlyAvailable > 50) return;

  const needed = 50 - currentlyAvailable;
  const seconds = needed / (restoreRate || 1);
  const ms = Math.min(30_000, Math.max(1_000, seconds * 1_000));
  await sleep(ms);
}

/**
 * Generic Admin GraphQL wrapper with retry/backoff.
 * - Retries on obvious throttling / transient network failures.
 * - Preserves the original response (including extensions) on success.
 */
async function adminGraphqlWithRetry<TData>(
  shopId: number,
  query: string,
  variables?: Record<string, any>,
  maxAttempts = 5,
): Promise<any & { data: TData }> {
  const admin = await getShopifyAdminClient(shopId);

  let attempt = 0;
  // basic exponential backoff with a sane upper bound
  const baseDelayMs = 1_000;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempt += 1;
    try {
      const response: any = await admin.graphql<TData>(query, {
        variables,
      });

      // If Shopify cost info is present, respect it before returning.
      const costExt: any = response.extensions?.cost;
      const throttle: ThrottleStatus | null = costExt?.throttleStatus ?? null;
      await respectThrottle(throttle);

      return response;
    } catch (err: any) {
      const message =
        (err && typeof err.message === "string" && err.message) ||
        "Unknown Shopify Admin error";

      const isThrottle =
        message.toLowerCase().includes("throttled") ||
        message.includes("429");

      const isTransientNetwork =
        typeof err.code === "string" &&
        ["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN"].includes(err.code);

      if (attempt >= maxAttempts || (!isThrottle && !isTransientNetwork)) {
        // Non-retryable or out of attempts.
        throw err;
      }

      const delay =
        Math.min(30_000, baseDelayMs * Math.pow(2, attempt - 1)) +
        Math.floor(Math.random() * 500); // add a bit of jitter
      console.warn(
        `[BulkOps] adminGraphqlWithRetry retrying (attempt=${attempt}, delayMs=${delay}) for shopId=${shopId}: ${message}`,
      );
      await sleep(delay);
    }
  }
}

async function startBulkOperation(
  shopId: number,
  query: string,
): Promise<string> {
  const response = await adminGraphqlWithRetry<{
    bulkOperationRunQuery: {
      bulkOperation: {
        id: string;
        status: string;
      };
      userErrors: { field: string[] | null; message: string }[];
    };
  }>(
    shopId,
    `#graphql
    mutation BulkExportRun($query: String!) {
      bulkOperationRunQuery(query: $query) {
        bulkOperation {
          id
          status
        }
        userErrors {
          field
          message
        }
      }
    }
  `,
    { query },
  );

  const { bulkOperationRunQuery } = response.data;

  if (bulkOperationRunQuery.userErrors.length > 0) {
    const msg = bulkOperationRunQuery.userErrors
      .map((e) => e.message)
      .join("; ");
    throw new Error(`Bulk operation failed to start: ${msg}`);
  }

  return bulkOperationRunQuery.bulkOperation.id;
}

/**
 * Polls currentBulkOperation until the shop's BulkOp completes.
 * NOTE: We rely on per-shop lock to ensure this worker is the only
 * BulkOp user in our app for this shop. If other apps run BulkOps,
 * this still targets "current" which is shared at the shop level.
 */
async function pollBulkOperationUntilFinished(
  shopId: number,
  {
    maxMinutes = 60,
    pollIntervalMs = 2_000,
  }: { maxMinutes?: number; pollIntervalMs?: number } = {},
) {
  const startedAt = Date.now();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const elapsedMinutes = (Date.now() - startedAt) / 60_000;
    if (elapsedMinutes > maxMinutes) {
      throw new Error(
        `Bulk operation polling exceeded maxMinutes=${maxMinutes}`,
      );
    }

    const response = await adminGraphqlWithRetry<{
      currentBulkOperation: {
        id: string;
        status: string;
        errorCode: string | null;
        createdAt: string;
        completedAt: string | null;
        objectCount: string;
        fileSize: string | null;
        url: string | null;
      } | null;
    }>(
      shopId,
      `#graphql
      query BulkExportCurrent {
        currentBulkOperation {
          id
          status
          errorCode
          createdAt
          completedAt
          objectCount
          fileSize
          url
        }
      }
    `,
    );

    const op = response.data.currentBulkOperation;
    if (!op) {
      throw new Error("No current bulk operation found.");
    }

    if (op.status === "COMPLETED") {
      if (!op.url) {
        throw new Error("Bulk operation completed but no URL provided.");
      }
      return op;
    }

    if (op.status === "FAILED" || op.status === "CANCELED") {
      throw new Error(
        `Bulk operation failed with status=${op.status} errorCode=${op.errorCode ?? "n/a"}`,
      );
    }

    await sleep(pollIntervalMs);
  }
}

/* ========================================================================== *
 * Per-shop concurrency
 * ========================================================================== */

async function withShopBulkOpsLock<T>(
  job: Job<BulkExportJobPayload>,
  fn: () => Promise<T>,
): Promise<T> {
  const redis = connection as any;
  const { shopId } = job.data;
  const lockKey = `export:bulkOps:lock:shop:${shopId}`;
  const ttlSeconds = 60 * 30;

  const acquired = await redis.set(
    lockKey,
    job.id ?? "1",
    "NX",
    "EX",
    ttlSeconds,
  );
  if (!acquired) {
    throw new Error(`BulkOps export already running for shopId=${shopId}`);
  }

  try {
    return await fn();
  } finally {
    try {
      await redis.del(lockKey);
    } catch {
      // Best-effort; TTL will eventually release.
    }
  }
}

/* ========================================================================== *
 * Filter DSL → Shopify search for BulkOps
 * ========================================================================== */

function buildShopifySearchQueryForJob(job: ExportJobModel): string {
  switch (job.scope) {
    case "ALL":
      return "";

    case "FILTERED": {
      if (!job.filterJson) return "";
      return compileFilterToShopifySearch(job.filterJson as unknown);
    }

    case "SELECTED":
      throw new Error(
        "SELECTED scope is not supported by BulkOps export. Engine selection bug.",
      );

    default: {
      const neverScope: never = job.scope as never;
      throw new Error(`Unsupported export scope for BulkOps: ${neverScope}`);
    }
  }
}

/* ========================================================================== *
 * Dynamic BulkOps selection set based on fieldKeys
 * ========================================================================== */

function buildBulkOpsProductSelectionSet(fieldKeys: string[]): string {
  const productFields = new Set<string>();
  const variantFields = new Set<string>();

  // Always get product id (needed for mapping).
  productFields.add("id");

  for (const key of fieldKeys) {
    switch (key) {
      // Product-level fields
      case "title":
        productFields.add("title");
        break;
      case "status":
        productFields.add("status");
        break;
      case "vendor":
        productFields.add("vendor");
        break;
      case "type":
      case "productType":
        productFields.add("productType");
        break;
      case "createdAt":
        productFields.add("createdAt");
        break;
      case "updatedAt":
        productFields.add("updatedAt");
        break;
      case "tags":
        productFields.add("tags");
        break;
      case "handle":
        productFields.add("handle");
        break;

      // Variant-level fields
      case "price":
        variantFields.add("price");
        break;
      case "comparePrice":
        variantFields.add("compareAtPrice");
        break;
      case "sku":
        variantFields.add("sku");
        break;
      case "barcode":
        variantFields.add("barcode");
        break;
      case "weight":
        variantFields.add("weight");
        break;

      default:
        // ignore unknown; you can extend later
        break;
    }
  }

  const productFieldsSelection = Array.from(productFields).join("\n");

  const needsVariants = fieldKeys.some((k) => VARIANT_FIELD_KEYS.has(k));

  let variantsSelection = "";
  if (needsVariants) {
    const variantSelection = Array.from(variantFields);
    if (!variantSelection.includes("id")) {
      variantSelection.unshift("id");
    }

    variantsSelection = `
      variants(first: 250) {
        edges {
          node {
            ${variantSelection.join("\n")}
          }
        }
      }
    `;
  }

  return `${productFieldsSelection}
${variantsSelection}`;
}

/* ========================================================================== *
 * JSONL streaming + shared mapper
 * ========================================================================== */

type BulkOpsVariantNode = {
  id: string;
  sku?: string | null;
  barcode?: string | null;
  price?: string | null;
  compareAtPrice?: string | null;
  weight?: number | null;
};

type BulkOpsProductNode = {
  id: string;
  title?: string | null;
  status?: string | null;
  vendor?: string | null;
  productType?: string | null;
  tags?: string[] | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  handle?: string | null;
  variants?: {
    edges?: {
      node: BulkOpsVariantNode;
    }[];
  } | null;
};

function createJsonlReader(body: NodeJS.ReadableStream) {
  return readline.createInterface({
    input: body,
    crlfDelay: Infinity,
  });
}

function normalizeBulkOpsNodeToShape(
  node: BulkOpsProductNode,
): ExportProductShape {
  const variants: ExportVariantShape[] =
    node.variants?.edges
      ?.map((edge) => edge?.node)
      .filter((v): v is BulkOpsVariantNode => !!v)
      .map((v) => ({
        id: v.id,
        price: v.price ?? null,
        compareAtPrice: v.compareAtPrice ?? null,
        sku: v.sku ?? null,
        barcode: v.barcode ?? null,
        weight: v.weight ?? null,
      })) ?? [];

  return {
    id: node.id,
    title: node.title ?? null,
    status: node.status ?? null,
    vendor: node.vendor ?? null,
    productType: node.productType ?? null,
    tags: node.tags ?? [],
    createdAt: node.createdAt ?? null,
    updatedAt: node.updatedAt ?? null,
    handle: node.handle ?? null,
    inventoryQuantity: null,
    variants,
  };
}

async function fetchJsonlWithRetry(
  url: string,
  maxAttempts = 5,
): Promise<NodeJS.ReadableStream> {
  let attempt = 0;
  const baseDelayMs = 1_000;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempt += 1;
    const res = await fetch(url);

    if (res.ok && res.body) {
      return res.body as any;
    }

    const isRetryable =
      res.status === 429 || (res.status >= 500 && res.status < 600);

    if (!isRetryable || attempt >= maxAttempts) {
      throw new Error(
        `Failed to download BulkOps JSONL: status=${res.status}`,
      );
    }

    const delay =
      Math.min(30_000, baseDelayMs * Math.pow(2, attempt - 1)) +
      Math.floor(Math.random() * 500);
    console.warn(
      `[BulkOps] fetchJsonlWithRetry retrying (attempt=${attempt}, delayMs=${delay}) url=${url}`,
    );
    await sleep(delay);
  }
}

async function streamCsvFromJsonl(
  url: string,
  fieldKeys: string[],
  fullPath: string,
): Promise<{ recordCount: number; fileSizeBytes: number }> {
  const body = await fetchJsonlWithRetry(url);

  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  const fileStream = createWriteStream(fullPath);

  fileStream.write(fieldKeys.join(",") + "\n");

  const reader = createJsonlReader(body);
  let recordCount = 0;

  for await (const line of reader) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const node = JSON.parse(trimmed) as BulkOpsProductNode;
    const shape = normalizeBulkOpsNodeToShape(node);
    const record = buildExportRecordFromShape(shape, fieldKeys);

    const row = fieldKeys
      .map((key) => csvEscape(record[key] ?? ""))
      .join(",");

    if (!fileStream.write(row + "\n")) {
      await once(fileStream, "drain");
    }

    recordCount += 1;
  }

  fileStream.end();
  await once(fileStream, "finish");

  const stat = await fs.stat(fullPath);

  return { recordCount, fileSizeBytes: stat.size };
}

async function streamJsonFromJsonl(
  url: string,
  fieldKeys: string[],
  fullPath: string,
): Promise<{ recordCount: number; fileSizeBytes: number }> {
  const body = await fetchJsonlWithRetry(url);

  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  const fileStream = createWriteStream(fullPath);

  const reader = createJsonlReader(body);

  let recordCount = 0;
  let first = true;

  fileStream.write("[");

  for await (const line of reader) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const node = JSON.parse(trimmed) as BulkOpsProductNode;
    const shape = normalizeBulkOpsNodeToShape(node);
    const record = buildExportRecordFromShape(shape, fieldKeys);

    const chunk = JSON.stringify(record);

    if (!first) {
      if (!fileStream.write(",")) {
        await once(fileStream, "drain");
      }
    } else {
      first = false;
    }

    if (!fileStream.write(chunk)) {
      await once(fileStream, "drain");
    }

    recordCount += 1;
  }

  fileStream.write("]");
  fileStream.end();
  await once(fileStream, "finish");

  const stat = await fs.stat(fullPath);

  return { recordCount, fileSizeBytes: stat.size };
}

async function streamXmlFromJsonl(
  url: string,
  fieldKeys: string[],
  fullPath: string,
): Promise<{ recordCount: number; fileSizeBytes: number }> {
  const body = await fetchJsonlWithRetry(url);

  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  const fileStream = createWriteStream(fullPath);

  const reader = createJsonlReader(body);

  let recordCount = 0;

  fileStream.write("<products>");

  for await (const line of reader) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const node = JSON.parse(trimmed) as BulkOpsProductNode;
    const shape = normalizeBulkOpsNodeToShape(node);
    const record = buildExportRecordFromShape(shape, fieldKeys);

    let productXml = "<product>";
    for (const key of fieldKeys) {
      const value = record[key] ?? "";
      productXml += `<${key}>${escapeXml(value)}</${key}>`;
    }
    productXml += "</product>";

    if (!fileStream.write(productXml)) {
      await once(fileStream, "drain");
    }

    recordCount += 1;
  }

  fileStream.write("</products>");
  fileStream.end();
  await once(fileStream, "finish");

  const stat = await fs.stat(fullPath);

  return { recordCount, fileSizeBytes: stat.size };
}

async function streamExportFromJsonl(
  url: string,
  format: "CSV" | "JSON" | "XML" | "XLSX",
  fieldKeys: string[],
  fullPath: string,
): Promise<{ recordCount: number; fileSizeBytes: number }> {
  switch (format) {
    case "CSV":
      return streamCsvFromJsonl(url, fieldKeys, fullPath);
    case "JSON":
      return streamJsonFromJsonl(url, fieldKeys, fullPath);
    case "XML":
      return streamXmlFromJsonl(url, fieldKeys, fullPath);
    case "XLSX":
      throw new Error("XLSX export via BulkOps is not implemented yet");
    default:
      throw new Error(`Unsupported export format for BulkOps: ${format}`);
  }
}

/* ========================================================================== *
 * Core BulkOps export handler
 * ========================================================================== */

async function getFieldKeysForJob(
  exportJobId: bigint,
  shopId: number,
): Promise<string[]> {
  const fields = await prisma.exportJobField.findMany({
    where: {
      exportJobId,
      exportJob: {
        shopId,
      },
    },
    orderBy: { order: "asc" },
  });

  if (!fields.length) {
    throw new Error("Export job has no selected fields");
  }

  return fields.map((f) => f.fieldKey);
}

async function handleBulkExportJob(
  job: Job<BulkExportJobPayload>,
): Promise<void> {
  const { shopId, exportJobId } = job.data;
  const id = BigInt(exportJobId);

  const dbJob = await prisma.exportJob.findFirst({
    where: { id, shopId },
  });

  if (!dbJob) return;
  if (dbJob.status === "COMPLETED") return;

  const runningJob = await prisma.exportJob.update({
    where: { id: dbJob.id },
    data: {
      status: "RUNNING",
      errorMessage: null,
      startedAt: dbJob.startedAt ?? new Date(),
    },
  });

  try {
    const fieldKeys = await getFieldKeysForJob(runningJob.id, shopId);

    const searchQuery = buildShopifySearchQueryForJob(runningJob);
    const selectionSet = buildBulkOpsProductSelectionSet(fieldKeys);

    const bulkQuery = `
      {
        products(query: ${JSON.stringify(searchQuery)}, first: 250) {
          edges {
            node {
              ${selectionSet}
            }
          }
        }
      }
    `;

    const bulkOpId = await startBulkOperation(shopId, bulkQuery);
    console.log(`[BulkOps] Started bulk operation`, {
      shopId,
      exportJobId,
      bulkOpId,
    });

    const op = await pollBulkOperationUntilFinished(shopId);
    console.log(`[BulkOps] Bulk operation completed`, {
      shopId,
      exportJobId,
      url: op.url,
      objectCount: op.objectCount,
    });

    if (!op.url) {
      throw new Error("Bulk operation finished without URL");
    }

    const baseDir = getExportsBaseDir();
    const shopDir = path.join(baseDir, String(shopId));
    await fs.mkdir(shopDir, { recursive: true });

    const ext = ensureSafeFormatExt(runningJob.format);
    const fileName = `${runningJob.id.toString()}.${ext}`;
    const fullPath = path.join(shopDir, fileName);

    const { recordCount, fileSizeBytes } = await streamExportFromJsonl(
      op.url,
      runningJob.format,
      fieldKeys,
      fullPath,
    );

    const storageKey = path.relative(baseDir, fullPath);

    await prisma.exportJob.update({
      where: { id: runningJob.id },
      data: {
        status: "COMPLETED",
        storageKey,
        recordCount,
        fileSizeBytes: BigInt(fileSizeBytes),
        completedAt: new Date(),
        errorMessage: null,
      },
    });
  } catch (err: any) {
    const message =
      err && typeof err.message === "string"
        ? err.message.slice(0, 512)
        : "BulkOps export failed";

    await prisma.exportJob.update({
      where: { id: dbJob.id },
      data: {
        status: "FAILED",
        errorMessage: message,
        completedAt: new Date(),
      },
    });

    throw err;
  }
}

/* ========================================================================== *
 * Worker bootstrap
 * ========================================================================== */

export const bulkExportWorker = new Worker<BulkExportJobPayload>(
  EXPORT_BULK_OPS_QUEUE_NAME,
  async (job) => {
    return withShopBulkOpsLock(job, () => handleBulkExportJob(job));
  },
  {
    connection,
    concurrency: 3,
  },
);

bulkExportWorker.on("completed", (job) => {
  console.log(`[BulkOps] Export job completed`, {
    jobId: job.id,
    shopId: job.data.shopId,
  });
});

bulkExportWorker.on("failed", (job, err) => {
  console.error(`[BulkOps] Export job failed`, {
    jobId: job?.id,
    shopId: job?.data.shopId,
    error: err,
  });
});
