// Download failures CSV endpoint

// FILE: web/controllers/bulkEditFailures.controller.js

import { listAllFailedBulkEditJobItems } from "../repositories/bulkEdit.repository.js";

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

function escapeCsv(value) {
  if (value == null) return "";
  const str = typeof value === "string" ? value : JSON.stringify(value);
  if (str.includes('"') || str.includes(",") || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * GET /api/bulk-edit/jobs/:id/failures.csv
 */
export async function downloadBulkEditFailuresCsvController(req, res) {
  try {
    const shopId = extractShop(req);
    const jobId = req.params?.id;

    if (!shopId || !jobId) {
      return res.status(400).json({
        ok: false,
        error: "Missing shop or job id",
      });
    }

    const failedItems = await listAllFailedBulkEditJobItems({
      jobId,
      shopId,
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="bulk-edit-failures-${jobId}.csv"`,
    );

    const headers = [
      "jobId",
      "inputLineNumber",
      "productId",
      "productGid",
      "variantId",
      "variantGid",
      "success",
      "errorMessage",
      "userErrorsJson",
      "inputJson",
      "resultJson",
      "createdAt",
    ];

    res.write(`${headers.join(",")}\n`);

    for (const item of failedItems) {
      const row = [
        item.jobId,
        item.inputLineNumber,
        item.productId,
        item.productGid,
        item.variantId,
        item.variantGid,
        item.success,
        item.errorMessage,
        item.userErrorsJson,
        item.inputJson,
        item.resultJson,
        item.createdAt?.toISOString?.() ?? "",
      ].map(escapeCsv);

      res.write(`${row.join(",")}\n`);
    }

    res.end();
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message || "Failed to download failures CSV",
    });
  }
}