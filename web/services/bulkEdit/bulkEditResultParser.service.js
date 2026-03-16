// FILE: web/services/bulkEdit/bulkEditResultParser.service.js

import readline from "node:readline";
import { Readable } from "node:stream";

import {
  createBulkEditJobItems,
  updateBulkEditJob,
  updateBulkEditJobItemsForLine,
} from "../../repositories/bulkEdit.repository.js";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeJsonParse(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function firstErrorMessage(userErrors) {
  const arr = asArray(userErrors);
  if (!arr.length) return null;
  return arr
    .map((e) => e?.message)
    .filter(Boolean)
    .join("; ")
    .slice(0, 5000);
}

async function streamJsonlLinesFromUrl(url) {
  const response = await fetch(url);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to download bulk result JSONL: HTTP ${response.status} ${text}`);
  }

  if (!response.body) {
    throw new Error("Bulk result response has no body");
  }

  const nodeStream = Readable.fromWeb(response.body);
  const rl = readline.createInterface({
    input: nodeStream,
    crlfDelay: Infinity,
  });

  const lines = [];
  for await (const line of rl) {
    if (line?.trim()) lines.push(line);
  }

  return lines;
}

function extractMutationPayload(job, lineJson) {
  if (job.mutationName === "productUpdate") {
    return lineJson?.data?.productUpdate ?? null;
  }

  if (job.mutationName === "productVariantsBulkUpdate") {
    return lineJson?.data?.productVariantsBulkUpdate ?? null;
  }

  return null;
}

export async function parseAndPersistBulkEditResults({
  job,
  resultUrl,
  statusFromWebhook,
  partialDataUrl = null,
  objectCount = null,
  fileSizeBytes = null,
  errorCode = null,
}) {
  const effectiveUrl = resultUrl || partialDataUrl;

  if (!effectiveUrl) {
    await updateBulkEditJob({
      jobId: job.id,
      data: {
        status: statusFromWebhook,
        resultUrl: resultUrl ?? null,
        partialDataUrl: partialDataUrl ?? null,
        objectCount,
        fileSizeBytes,
        errorCode,
        completedAt: new Date(),
        errorMessage:
          statusFromWebhook === "COMPLETED"
            ? null
            : "Bulk operation finished without a downloadable result URL",
      },
    });

    return {
      parsedLineCount: 0,
      itemCount: 0,
      successCount: 0,
      failureCount: 0,
    };
  }

  const lines = await streamJsonlLinesFromUrl(effectiveUrl);

  let successCount = 0;
  let failureCount = 0;
  let extraItemsBuffer = [];

  for (let i = 0; i < lines.length; i += 1) {
    const inputLineNumber = i + 1;
    const line = lines[i];
    const lineJson = safeJsonParse(line);

    if (!lineJson) {
      await updateBulkEditJobItemsForLine({
        jobId: job.id,
        inputLineNumber,
        data: {
          success: false,
          resultJson: { rawLine: line },
          userErrorsJson: [],
          errorMessage: "Invalid JSONL result line",
        },
      });
      failureCount += 1;
      continue;
    }

    const payload = extractMutationPayload(job, lineJson);
    const userErrors = asArray(payload?.userErrors);
    const errorMessage = firstErrorMessage(userErrors);

    if (job.mutationName === "productUpdate") {
      const ok = !!payload?.product && userErrors.length === 0;

      await updateBulkEditJobItemsForLine({
        jobId: job.id,
        inputLineNumber,
        data: {
          success: ok,
          resultJson: lineJson,
          userErrorsJson: userErrors,
          errorMessage: ok ? null : errorMessage ?? "Product update failed",
        },
      });

      if (ok) successCount += 1;
      else failureCount += 1;
      continue;
    }

    if (job.mutationName === "productVariantsBulkUpdate") {
      const variants = asArray(payload?.productVariants);
      const ok = variants.length > 0 && userErrors.length === 0;

      await updateBulkEditJobItemsForLine({
        jobId: job.id,
        inputLineNumber,
        data: {
          success: ok,
          resultJson: lineJson,
          userErrorsJson: userErrors,
          errorMessage:
            ok ? null : errorMessage ?? "Variant bulk update returned no updated variants",
        },
      });

      if (ok) {
        successCount += variants.length;
      } else {
        failureCount += 1;
      }

      for (const variant of variants) {
        extraItemsBuffer.push({
          inputLineNumber,
          productId: null,
          productGid: payload?.product?.id ?? null,
          variantId: null,
          variantGid: variant?.id ?? null,
          inputJson: null,
          resultJson: lineJson,
          userErrorsJson: userErrors,
          success: userErrors.length === 0,
          errorMessage: userErrors.length === 0 ? null : errorMessage,
        });
      }

      if (extraItemsBuffer.length >= 500) {
        await createBulkEditJobItems({
          jobId: job.id,
          shopId: job.shopId,
          items: extraItemsBuffer,
        });
        extraItemsBuffer = [];
      }

      continue;
    }

    await updateBulkEditJobItemsForLine({
      jobId: job.id,
      inputLineNumber,
      data: {
        success: false,
        resultJson: lineJson,
        userErrorsJson: [],
        errorMessage: `Unsupported mutationName "${job.mutationName}" in result parser`,
      },
    });

    failureCount += 1;
  }

  if (extraItemsBuffer.length > 0) {
    await createBulkEditJobItems({
      jobId: job.id,
      shopId: job.shopId,
      items: extraItemsBuffer,
    });
  }

  await updateBulkEditJob({
    jobId: job.id,
    data: {
      status: statusFromWebhook,
      resultUrl: resultUrl ?? null,
      partialDataUrl: partialDataUrl ?? null,
      objectCount,
      fileSizeBytes,
      errorCode,
      completedAt: new Date(),
      errorMessage:
        statusFromWebhook === "COMPLETED"
          ? null
          : failureCount > 0
            ? `${failureCount} result item(s) failed`
            : errorCode ?? "Bulk operation finished unsuccessfully",
    },
  });

  return {
    parsedLineCount: lines.length,
    itemCount: successCount + failureCount,
    successCount,
    failureCount,
  };
}