// web/workers/export.worker.ts
//
// Worker for executing FAST-plane export jobs.
//
// Responsibilities:
//  - Consume ExportJobPayload from BullMQ.
//  - Resolve products to export based on job scope (ALL / FILTERED / SELECTED).
//  - Aggregate tags + variants from FAST plane.
//  - Normalize into ExportProductShape and map via buildExportRecordFromShape.
//  - Serialize records into CSV / JSON / XML files (minimal v1; XLSX not implemented).
//  - Persist storageKey, recordCount, fileSizeBytes, completedAt, status.
//  - Handle errors by marking job as FAILED with a short errorMessage.
//
// NOTE:
//  - FILTERED scope uses SnapshotRun/SnapshotProduct → ProductLite lookup.
//  - This worker is for FAST exports only; BulkOps is handled by export.bulkOps.worker.ts.

import type { Job } from "bullmq";
import fs from "node:fs/promises";
import path from "node:path";

import type {
  ExportJob as ExportJobModel,
  ExportJobField,
  ProductLite,
  ProductTag,
  VariantRollup,
} from "@prisma/client";

import { prisma } from "../../../db/prisma";
import { buildRedisConnection } from "../lib/jobs/redis";
import {
  EXPORT_QUEUE_NAME,
  type ExportJobPayload,
} from "../lib/jobs/queues/exportQueue";

import {
  buildExportRecordFromShape,
  type ExportProductShape,
  type ExportVariantShape,
} from "../../../shared/export/exportFieldMapper";

const connection = buildRedisConnection();

/* ========================================================================== *
 * Helpers: filesystem + serialization
 * ========================================================================== */

function getExportsBaseDir(): string {
  return process.env.EXPORTS_DIR || path.join(process.cwd(), "exports");
}

function ensureSafeFormatExt(format: ExportJobModel["format"]): string {
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

function serializeCsv(
  fieldKeys: string[],
  records: Array<Record<string, string>>,
): string {
  const header = fieldKeys.join(",");
  const lines = records.map((record) =>
    fieldKeys.map((key) => csvEscape(record[key] ?? "")).join(","),
  );
  return [header, ...lines].join("\n");
}

function serializeJson(records: Array<Record<string, string>>): string {
  return JSON.stringify(records, null, 2);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function serializeXml(
  fieldKeys: string[],
  records: Array<Record<string, string>>,
): string {
  const productsXml = records
    .map((record) => {
      const fieldsXml = fieldKeys
        .map((key) => {
          const v = record[key] ?? "";
          return `<${key}>${escapeXml(v)}</${key}>`;
        })
        .join("");
      return `<product>${fieldsXml}</product>`;
    })
    .join("");

  return `<products>${productsXml}</products>`;
}

async function writeExportFile(
  job: ExportJobModel,
  fieldKeys: string[],
  records: Array<Record<string, string>>,
): Promise<{ storageKey: string; fileSizeBytes: number }> {
  const baseDir = getExportsBaseDir();
  const shopDir = path.join(baseDir, String(job.shopId));
  const ext = ensureSafeFormatExt(job.format);
  const fileName = `${job.id.toString()}.${ext}`;
  const fullPath = path.join(shopDir, fileName);

  await fs.mkdir(shopDir, { recursive: true });

  let content: string;

  switch (job.format) {
    case "CSV":
      content = serializeCsv(fieldKeys, records);
      break;
    case "JSON":
      content = serializeJson(records);
      break;
    case "XML":
      content = serializeXml(fieldKeys, records);
      break;
    case "XLSX":
      throw new Error("XLSX export is not implemented yet (FAST plane)");
    default:
      throw new Error(`Unsupported export format: ${job.format}`);
  }

  const buffer = Buffer.from(content, "utf8");
  await fs.writeFile(fullPath, buffer);

  const storageKey = path.relative(baseDir, fullPath);
  const fileSizeBytes = buffer.byteLength;

  return { storageKey, fileSizeBytes };
}

/* ========================================================================== *
 * Helpers: data resolution (FAST plane)
 * ========================================================================== */

async function getFieldKeysForJob(
  exportJobId: bigint,
  shopId: number,
): Promise<string[]> {
  const fields: ExportJobField[] = await prisma.exportJobField.findMany({
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

async function getProductsForAllScope(shopId: number): Promise<ProductLite[]> {
  return prisma.productLite.findMany({
    where: { shopId },
    orderBy: { id: "asc" },
  });
}

async function getProductsForSelectedScope(
  job: ExportJobModel,
): Promise<ProductLite[]> {
  if (!job.selectedProductIds) return [];

  const ids = job.selectedProductIds as unknown as string[];
  if (!Array.isArray(ids) || ids.length === 0) return [];

  return prisma.productLite.findMany({
    where: {
      shopId: job.shopId,
      shopifyProductGid: {
        in: ids,
      },
    },
    orderBy: { id: "asc" },
  });
}

async function getProductsForFilteredScope(
  job: ExportJobModel,
): Promise<ProductLite[]> {
  if (!job.planHash) {
    throw new Error(
      "Cannot run FILTERED export: job.planHash is missing. Please re-create the export from a valid filter.",
    );
  }

  const snapshotRun = await prisma.snapshotRun.findFirst({
    where: {
      shopId: job.shopId,
      planHash: job.planHash,
      status: "COMPLETED",
    },
    orderBy: { completedAt: "desc" },
  });

  if (!snapshotRun) {
    throw new Error(
      "No completed snapshot found for this filter plan. Please run the filter and snapshot before exporting.",
    );
  }

  const snapshotProducts = await prisma.snapshotProduct.findMany({
    where: {
      snapshotRunId: snapshotRun.id,
    },
    select: { productGid: true },
  });

  if (!snapshotProducts.length) return [];

  const productGids = snapshotProducts.map((sp) => sp.productGid);

  return prisma.productLite.findMany({
    where: {
      shopId: job.shopId,
      shopifyProductGid: {
        in: productGids,
      },
    },
    orderBy: { id: "asc" },
  });
}

async function resolveProductsForJob(
  job: ExportJobModel,
): Promise<ProductLite[]> {
  switch (job.scope) {
    case "ALL":
      return getProductsForAllScope(job.shopId);
    case "SELECTED":
      return getProductsForSelectedScope(job);
    case "FILTERED":
      return getProductsForFilteredScope(job);
    default:
      throw new Error(`Unsupported export scope: ${job.scope}`);
  }
}

/**
 * Map productId → tags[] for a given shop.
 */
async function getTagsByProductId(
  shopId: number,
  productIds: bigint[],
): Promise<Map<bigint, string[]>> {
  if (!productIds.length) return new Map();

  const tags: ProductTag[] = await prisma.productTag.findMany({
    where: {
      shopId,
      productId: { in: productIds },
    },
    orderBy: [{ productId: "asc" }, { tag: "asc" }],
  });

  const map = new Map<bigint, string[]>();

  for (const row of tags) {
    const pid = row.productId as unknown as bigint;
    const existing = map.get(pid);
    if (existing) {
      existing.push(row.tag);
    } else {
      map.set(pid, [row.tag]);
    }
  }

  return map;
}

/**
 * Map productId → variants[] in ExportVariantShape form.
 */
async function getVariantsByProductId(
  shopId: number,
  productIds: bigint[],
): Promise<Map<bigint, ExportVariantShape[]>> {
  if (!productIds.length) return new Map();

  const variants: VariantRollup[] = await prisma.variantRollup.findMany({
    where: {
      shopId,
      productId: { in: productIds },
    },
    orderBy: [{ productId: "asc" }, { id: "asc" }],
  });

  const map = new Map<bigint, ExportVariantShape[]>();

  for (const v of variants) {
    const pid = v.productId as unknown as bigint;
    const arr = map.get(pid) ?? [];
    arr.push({
      id: v.shopifyVariantGid ?? v.id.toString(),
      price: v.price != null ? v.price.toString() : null,
      compareAtPrice:
        v.compareAtPrice != null ? v.compareAtPrice.toString() : null,
      sku: v.sku ?? null,
      barcode: v.barcode ?? null,
      weight: v.weight != null ? v.weight.toString() : null,
    });
    map.set(pid, arr);
  }

  return map;
}

/**
 * Normalize a ProductLite row into ExportProductShape, using tags + variants maps.
 */
function normalizeFastProductToShape(
  product: ProductLite,
  tagsByProductId: Map<bigint, string[]>,
  variantsByProductId: Map<bigint, ExportVariantShape[]>,
): ExportProductShape {
  const pid = product.id as unknown as bigint;

  return {
    id: product.shopifyProductGid ?? "",
    title: product.title,
    status: product.status,
    vendor: product.vendor,
    productType: (product as any).productType ?? null,
    tags: tagsByProductId.get(pid) ?? [],
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
    handle: (product as any).handle ?? null,
    inventoryQuantity: (product as any).inventoryQuantity ?? null,
    variants: variantsByProductId.get(pid) ?? [],
  };
}

/* ========================================================================== *
 * Worker handler
 * ========================================================================== */

export async function handleFastExportJob(
  job: Job<ExportJobPayload>,
): Promise<void> {
  const { shopId, exportJobId } = job.data;

  const dbJob = await prisma.exportJob.findFirst({
    where: {
      id: BigInt(exportJobId),
      shopId,
    },
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
    const products = await resolveProductsForJob(runningJob);

    const productIds = products.map((p) => p.id as unknown as bigint);

    const [tagsByProductId, variantsByProductId] = await Promise.all([
      getTagsByProductId(runningJob.shopId, productIds),
      getVariantsByProductId(runningJob.shopId, productIds),
    ]);

    const shapes: ExportProductShape[] = products.map((p) =>
      normalizeFastProductToShape(p, tagsByProductId, variantsByProductId),
    );

    const records = shapes.map((shape) =>
      buildExportRecordFromShape(shape, fieldKeys),
    );

    const { storageKey, fileSizeBytes } = await writeExportFile(
      runningJob,
      fieldKeys,
      records,
    );

    await prisma.exportJob.update({
      where: { id: runningJob.id },
      data: {
        status: "COMPLETED",
        storageKey,
        recordCount: records.length,
        fileSizeBytes: BigInt(fileSizeBytes),
        completedAt: new Date(),
        errorMessage: null,
      },
    });
  } catch (err: any) {
    const errorMessage =
      err && typeof err.message === "string"
        ? err.message.slice(0, 512)
        : "Export job failed";

    await prisma.exportJob.update({
      where: { id: dbJob.id },
      data: {
        status: "FAILED",
        errorMessage,
        completedAt: new Date(),
      },
    });

    throw err;
  }
}
