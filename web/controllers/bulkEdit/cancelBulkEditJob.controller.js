// FILE: web/controllers/bulkEdit/cancelBulkEditJob.controller.js

import {
  getBulkEditJobInternalById,
  updateBulkEditJob,
} from "../../repositories/bulkEdit.repository.js";

export async function cancelBulkEditJobController(req, res) {
  try {
    const { id } = req.params;

    const job = await getBulkEditJobInternalById(id);

    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    if (["COMPLETED", "FAILED", "CANCELLED"].includes(job.status)) {
      return res.status(400).json({
        error: "Job cannot be cancelled",
      });
    }

    await updateBulkEditJob({
      jobId: id,
      data: {
        status: "CANCELLED",
        completedAt: new Date(),
      },
    });

    res.json({
      success: true,
      message: "Job cancelled",
    });
  } catch (err) {
    console.error("cancelBulkEditJob error:", err);
    res.status(500).json({ error: "Failed to cancel job" });
  }
}