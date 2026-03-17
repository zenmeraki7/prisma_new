// FILE: web/controllers/bulkEdit/getBulkEditJob.controller.js

import {
  listBulkEditJobs,
  getBulkEditJobById,
} from "../../repositories/bulkEdit.repository.js";

export async function getBulkEditJobsController(req, res) {
  try {
    const shopId = req.shop?.id || req.headers["x-shop-id"];

    const jobs = await listBulkEditJobs({
      shopId,
      take: 20,
    });

    res.json({ jobs });
  } catch (err) {
    console.error("getBulkEditJobs error:", err);
    res.status(500).json({ error: "Failed to fetch jobs" });
  }
}

export async function getBulkEditJobByIdController(req, res) {
  try {
    const shopId = req.shop?.id || req.headers["x-shop-id"];
    const { id } = req.params;

    const job = await getBulkEditJobById({
      shopId,
      jobId: id,
    });

    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    res.json({ job });
  } catch (err) {
    console.error("getBulkEditJobById error:", err);
    res.status(500).json({ error: "Failed to fetch job" });
  }
}