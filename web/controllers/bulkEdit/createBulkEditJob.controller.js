// FILE: web/controllers/bulkEdit/createBulkEditJob.controller.js

import { createBulkEditJob } from "../../repositories/bulkEdit.repository.js";
import { enqueueBulkEditJob } from "../../workers/queue.js";

export async function createBulkEditJobController(req, res) {
  try {
    const shopId = req.shop?.id || req.headers["x-shop-id"];

    const {
      scope,
      action,
      fieldKey,
      selectionMode,
      filterExpr,
      compiledWhere,
      ids,
      editPayload,
    } = req.body;

    if (!scope || !action || !fieldKey) {
      return res.status(400).json({
        error: "Missing required fields",
      });
    }

    const job = await createBulkEditJob({
      shopId,
      scope,
      action,
      fieldKey,

      filterExprJson: filterExpr ?? null,
      rawFilterExprJson: filterExpr ?? null,
      compiledWhereJson: compiledWhere ?? null,

      selectionMode: selectionMode ?? "PRODUCT_WHERE",

      editPayloadJson: editPayload ?? {},

      mutationName: "bulkOperationRunMutation",
    });

    // 🔥 enqueue worker
    await enqueueBulkEditJob(job.id);

    return res.json({
      success: true,
      job,
    });
  } catch (err) {
    console.error("createBulkEditJob error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}