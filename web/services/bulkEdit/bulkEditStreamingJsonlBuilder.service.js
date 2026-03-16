// FILE: web/services/bulkEdit/bulkEditStreamingJsonlBuilder.service.js

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { prisma } from "../../db/prisma.js";
import { createBulkEditJobItems } from "../../repositories/bulkEdit.repository.js";

const DEFAULT_BATCH_SIZE = Number(process.env.BULK_EDIT_DB_BATCH_SIZE || 5000);
const DEFAULT_AUDIT_BATCH_SIZE = Number(
  process.env.BULK_EDIT_AUDIT_BATCH_SIZE || 2000,
);

/**
 * Creates a temp JSONL file writer for a bulk edit job.
 */
function createJsonlWriteStream(jobId) {
  const filename = `bulk-edit-${jobId}.jsonl`;
  const filePath = path.join(os.tmpdir(), filename);
  const stream = fs.createWriteStream(filePath, { encoding: "utf8" });

  return { filename, filePath, stream };
}

async function endStream(stream) {
  await new Promise((resolve, reject) => {
    stream.end((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function flushAuditItems({ jobId, shopId, auditItems }) {
  if (!auditItems.length) return;

  await createBulkEditJobItems({
    jobId,
    shopId,
    items: auditItems,
  });

  auditItems.length = 0;
}

function productCursorWhere(lastId) {
  if (!lastId) return {};
  return { id: { gt: lastId } };
}

function variantCursorWhere(lastBigIntId) {
  if (lastBigIntId == null) return {};
  return { id: { gt: lastBigIntId } };
}

function assertSelectionMode(scope, selection) {
  if (!selection?.mode) {
    throw new Error(`Missing selection.mode for ${scope} bulk edit`);
  }

  if (scope === "PRODUCT") {
    if (!["PRODUCT_WHERE", "PRODUCT_IDS"].includes(selection.mode)) {
      throw new Error(
        `Invalid selection.mode "${selection.mode}" for PRODUCT bulk edit`,
      );
    }
  }

  if (scope === "VARIANT") {
    if (!["VARIANT_WHERE", "VARIANT_IDS"].includes(selection.mode)) {
      throw new Error(
        `Invalid selection.mode "${selection.mode}" for VARIANT bulk edit`,
      );
    }
  }
}

function normalizeIds(ids) {
  return [...new Set((ids || []).map((v) => String(v)).filter(Boolean))];
}

function buildProductWhere({ shopId, selection, lastId }) {
  if (selection.mode === "PRODUCT_IDS") {
    return {
      shopId,
      id: { in: normalizeIds(selection.ids) },
      shopifyGid: { not: null },
      ...productCursorWhere(lastId),
    };
  }

  return {
    ...(selection.where || {}),
    shopifyGid: { not: null },
    ...productCursorWhere(lastId),
  };
}

function buildVariantWhere({ shopId, selection, lastRowId }) {
  if (selection.mode === "VARIANT_IDS") {
    return {
      shopId,
      variantId: { in: normalizeIds(selection.ids) },
      variantGid: { not: null },
      productGid: { not: null },
      ...variantCursorWhere(lastRowId),
    };
  }

  return {
    ...(selection.where || {}),
    variantGid: { not: null },
    productGid: { not: null },
    ...variantCursorWhere(lastRowId),
  };
}

function ensureProductRow(row) {
  if (!row?.id || !row?.shopifyGid) return null;

  return {
    productId: row.id,
    productGid: row.shopifyGid,
  };
}

function ensureVariantRow(row) {
  if (!row?.variantId || !row?.variantGid || !row?.productId || !row?.productGid) {
    return null;
  }

  return {
    variantId: row.variantId,
    variantGid: row.variantGid,
    productId: row.productId,
    productGid: row.productGid,
  };
}

async function streamProductJsonl({
  jobId,
  shopId,
  selection,
  plan,
  value,
  stream,
  batchSize,
  auditBatchSize,
}) {
  let lastId = null;
  let selectedCount = 0;
  let inputLineCount = 0;
  const auditItems = [];

  while (true) {
    const rows = await prisma.productLite.findMany({
      where: buildProductWhere({ shopId, selection, lastId }),
      select: {
        id: true,
        shopifyGid: true,
      },
      orderBy: { id: "asc" },
      take: batchSize,
    });

    if (!rows.length) break;

    for (const rawRow of rows) {
      const row = ensureProductRow(rawRow);
      if (!row) continue;

      const payload = plan.buildProductVariables({
        row,
        value,
      });

      inputLineCount += 1;
      selectedCount += 1;

      stream.write(`${JSON.stringify(payload)}\n`);

      auditItems.push({
        inputLineNumber: inputLineCount,
        productId: row.productId,
        productGid: row.productGid,
        variantId: null,
        variantGid: null,
        inputJson: payload,
        resultJson: null,
        userErrorsJson: null,
        success: null,
        errorMessage: null,
      });

      if (auditItems.length >= auditBatchSize) {
        await flushAuditItems({
          jobId,
          shopId,
          auditItems,
        });
      }
    }

    lastId = rows[rows.length - 1].id;
  }

  await flushAuditItems({
    jobId,
    shopId,
    auditItems,
  });

  return {
    selectedCount,
    inputLineCount,
  };
}

async function streamVariantJsonl({
  jobId,
  shopId,
  selection,
  plan,
  value,
  stream,
  batchSize,
  auditBatchSize,
}) {
  let lastRowId = null;
  let selectedCount = 0;
  let inputLineCount = 0;
  const auditItems = [];

  let currentProductGid = null;
  let currentGroupRows = [];

  async function flushCurrentVariantGroup() {
    if (!currentProductGid || currentGroupRows.length === 0) return;

    const payload = plan.buildVariantVariables({
      productGid: currentProductGid,
      rows: currentGroupRows,
      value,
    });

    inputLineCount += 1;
    stream.write(`${JSON.stringify(payload)}\n`);

    for (const row of currentGroupRows) {
      auditItems.push({
        inputLineNumber: inputLineCount,
        productId: row.productId,
        productGid: row.productGid,
        variantId: row.variantId,
        variantGid: row.variantGid,
        inputJson: payload,
        resultJson: null,
        userErrorsJson: null,
        success: null,
        errorMessage: null,
      });
    }

    if (auditItems.length >= auditBatchSize) {
      await flushAuditItems({
        jobId,
        shopId,
        auditItems,
      });
    }

    currentProductGid = null;
    currentGroupRows = [];
  }

  while (true) {
    const rows = await prisma.variantLite.findMany({
      where: buildVariantWhere({ shopId, selection, lastRowId }),
      select: {
        id: true,
        variantId: true,
        variantGid: true,
        productId: true,
        productGid: true,
      },
      orderBy: [{ productGid: "asc" }, { id: "asc" }],
      take: batchSize,
    });

    if (!rows.length) break;

    for (const rawRow of rows) {
      const row = ensureVariantRow(rawRow);
      if (!row) continue;

      selectedCount += 1;

      if (currentProductGid === null) {
        currentProductGid = row.productGid;
        currentGroupRows.push(row);
        continue;
      }

      if (currentProductGid === row.productGid) {
        currentGroupRows.push(row);
        continue;
      }

      await flushCurrentVariantGroup();

      currentProductGid = row.productGid;
      currentGroupRows.push(row);
    }

    lastRowId = rows[rows.length - 1].id;
  }

  await flushCurrentVariantGroup();

  await flushAuditItems({
    jobId,
    shopId,
    auditItems,
  });

  return {
    selectedCount,
    inputLineCount,
  };
}

/**
 * Streams bulk edit JSONL directly from DB in bounded memory.
 *
 * Guarantees:
 * - does not load all matching products/variants in memory
 * - persists audit rows incrementally
 * - groups variant edits by productGid as required by Shopify
 */
export async function streamBulkEditJsonlFromDb({
  jobId,
  shopId,
  scope,
  selection,
  plan,
  value,
  batchSize = DEFAULT_BATCH_SIZE,
  auditBatchSize = DEFAULT_AUDIT_BATCH_SIZE,
}) {
  if (!jobId) throw new Error("Missing jobId");
  if (!shopId) throw new Error("Missing shopId");
  if (!scope) throw new Error("Missing scope");
  if (!selection) throw new Error("Missing selection");
  if (!plan) throw new Error("Missing plan");

  assertSelectionMode(scope, selection);

  const { filename, filePath, stream } = createJsonlWriteStream(jobId);

  try {
    let result;

    if (scope === "PRODUCT") {
      result = await streamProductJsonl({
        jobId,
        shopId,
        selection,
        plan,
        value,
        stream,
        batchSize,
        auditBatchSize,
      });
    } else if (scope === "VARIANT") {
      result = await streamVariantJsonl({
        jobId,
        shopId,
        selection,
        plan,
        value,
        stream,
        batchSize,
        auditBatchSize,
      });
    } else {
      throw new Error(`Unsupported bulk edit scope "${scope}"`);
    }

    await endStream(stream);

    const stats = await fs.promises.stat(filePath);

    return {
      filename,
      filePath,
      fileSizeBytes: stats.size,
      selectedCount: result.selectedCount,
      inputLineCount: result.inputLineCount,
    };
  } catch (error) {
    stream.destroy();
    throw error;
  }
}