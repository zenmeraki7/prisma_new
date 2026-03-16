// FILE: web/controllers/bulkEditWebhook.controller.js

import shopify from "../shopify.js";
import {
  findBulkEditJobByBulkOperationId,
  updateBulkEditJob,
} from "../repositories/bulkEdit.repository.js";
import { parseAndPersistBulkEditResults } from "../services/bulkEdit/bulkEditResultParser.service.js";
import { mapShopifyBulkStatusToLocalStatus } from "../services/shopify/bulkOperation.service.js";

/**
 * Shopify bulk_operations/finish webhook payload contains the BulkOperation resource.
 * We care about:
 * - admin_graphql_api_id
 * - status
 * - url
 * - partial_data_url
 * - error_code
 * - object_count
 * - file_size
 */
function extractWebhookFields(payload) {
  return {
    bulkOperationId:
      payload?.admin_graphql_api_id ||
      payload?.id ||
      null,
    status: payload?.status || null,
    resultUrl: payload?.url || null,
    partialDataUrl: payload?.partial_data_url || null,
    errorCode: payload?.error_code || null,
    objectCount:
      payload?.object_count != null ? Number(payload.object_count) : null,
    fileSizeBytes:
      payload?.file_size != null ? BigInt(payload.file_size) : null,
  };
}

export async function bulkOperationsFinishWebhookController(req, res) {
  try {
    const { topic, shop, payload } = await shopify.authenticate.webhook(req, res);

    if (topic !== "BULK_OPERATIONS_FINISH" && topic !== "bulk_operations/finish") {
      return res.status(200).send("ignored");
    }

    const {
      bulkOperationId,
      status,
      resultUrl,
      partialDataUrl,
      errorCode,
      objectCount,
      fileSizeBytes,
    } = extractWebhookFields(payload);

    if (!shop || !bulkOperationId) {
      return res.status(200).send("missing shop or bulk operation id");
    }

    const job = await findBulkEditJobByBulkOperationId({
      shopId: shop,
      bulkOperationId,
    });

    if (!job) {
      return res.status(200).send("no matching bulk edit job");
    }

    const localStatus = mapShopifyBulkStatusToLocalStatus(status);

    await updateBulkEditJob({
      jobId: job.id,
      shopId: shop,
      data: {
        status: localStatus,
        resultUrl: resultUrl ?? job.resultUrl,
        partialDataUrl: partialDataUrl ?? job.partialDataUrl,
        objectCount,
        fileSizeBytes,
        errorCode: errorCode ?? job.errorCode,
      },
    });

    await parseAndPersistBulkEditResults({
      job,
      resultUrl,
      partialDataUrl,
      statusFromWebhook: localStatus,
      objectCount,
      fileSizeBytes,
      errorCode,
    });

    return res.status(200).send("ok");
  } catch (error) {
    console.error("[bulk-edit-webhook] failed", {
      error: error?.message,
    });

    return res.status(500).send("error");
  }
}