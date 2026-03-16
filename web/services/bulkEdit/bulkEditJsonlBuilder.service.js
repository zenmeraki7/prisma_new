// FILE: web/services/bulkEdit/bulkEditJsonlBuilder.service.js

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function groupBy(items, key) {
  const map = new Map();

  for (const item of items) {
    const groupKey = item[key];
    if (!map.has(groupKey)) map.set(groupKey, []);
    map.get(groupKey).push(item);
  }

  return map;
}

export async function buildBulkEditJsonl({
  jobId,
  plan,
  rows,
  value,
}) {
  const filename = `bulk-edit-${jobId}.jsonl`;
  const filePath = path.join(os.tmpdir(), filename);

  const stream = fs.createWriteStream(filePath, { encoding: "utf8" });

  let inputLineCount = 0;
  const auditItems = [];

  if (plan.scope === "PRODUCT") {
    for (const row of rows) {
      const payload = plan.buildProductVariables({ row, value });
      inputLineCount += 1;

      stream.write(`${JSON.stringify(payload)}\n`);

      auditItems.push({
        inputLineNumber: inputLineCount,
        productId: row.productId ?? null,
        productGid: row.productGid ?? null,
        variantId: null,
        variantGid: null,
        inputJson: payload,
        resultJson: null,
        userErrorsJson: null,
        success: null,
        errorMessage: null,
      });
    }
  }

  if (plan.scope === "VARIANT") {
    const grouped = groupBy(rows, "productGid");

    for (const [productGid, groupRows] of grouped.entries()) {
      const payload = plan.buildVariantVariables({
        productGid,
        rows: groupRows,
        value,
      });

      inputLineCount += 1;
      stream.write(`${JSON.stringify(payload)}\n`);

      for (const row of groupRows) {
        auditItems.push({
          inputLineNumber: inputLineCount,
          productId: row.productId ?? null,
          productGid: row.productGid ?? null,
          variantId: row.variantId ?? null,
          variantGid: row.variantGid ?? null,
          inputJson: payload,
          resultJson: null,
          userErrorsJson: null,
          success: null,
          errorMessage: null,
        });
      }
    }
  }

  await new Promise((resolve, reject) => {
    stream.end((error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  const stats = await fs.promises.stat(filePath);

  return {
    filePath,
    filename,
    fileSizeBytes: stats.size,
    selectedCount: rows.length,
    inputLineCount,
    auditItems,
  };
}