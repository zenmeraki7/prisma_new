// FILE: web/controllers/bulkEditHistory.controller.js

import { listBulkEditJobs } from "../repositories/bulkEdit.repository.js";

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

/**
 * GET /api/bulk-edit/jobs
 * Optional query params:
 *   ?take=20
 */
export async function listBulkEditJobsController(req, res) {
  try {
    const shopId = extractShop(req);
    const take = Math.min(Number(req.query?.take || 20), 100);

    if (!shopId) {
      return res.status(400).json({
        ok: false,
        error: "Missing shop",
      });
    }

    const jobs = await listBulkEditJobs({
      shopId,
      take,
    });

    return res.status(200).json({
      ok: true,
      jobs,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message || "Failed to load bulk edit jobs",
    });
  }
}