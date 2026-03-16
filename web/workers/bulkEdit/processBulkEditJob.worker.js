// Worker flow

// web/workers/bulkEdit/processBulkEditJob.worker.js

import { planBulkEdit } from "../../services/bulkEdit/bulkEditPlanner.service.js";
import { selectRowsForBulkEdit } from "../../services/bulkEdit/bulkEditSelection.service.js";
import { buildBulkEditJsonl } from "../../services/bulkEdit/bulkEditJsonlBuilder.service.js";
import { uploadJsonlForBulkMutation } from "../../services/shopify/stagedUpload.service.js";
import { runBulkMutation } from "../../services/shopify/bulkOperation.service.js";

export async function processBulkEditJob(job) {
  const { jobId, shop, operation, value, compiledWhereSql, compiledParams } = job.data;

  const config = planBulkEdit({ operation });

  const rows = await selectRowsForBulkEdit({
    shop,
    scope: config.scope,
    compiledWhereSql,
    compiledParams,
  });

  if (!rows.length) {
    return {
      status: "COMPLETED",
      selectedCount: 0,
      message: "No matching rows",
    };
  }

  const jsonlPath = await buildBulkEditJsonl({
    operationConfig: config,
    rows,
    value,
    jobId,
  });

  const { stagedUploadPath } = await uploadJsonlForBulkMutation({
    shop,
    localFilePath: jsonlPath,
    filename: `bulk-edit-${jobId}.jsonl`,
  });

  const bulkOp = await runBulkMutation({
    shop,
    mutation: config.mutation,
    stagedUploadPath,
  });

  return {
    status: "SUBMITTED",
    selectedCount: rows.length,
    bulkOperationId: bulkOp.id,
  };
}