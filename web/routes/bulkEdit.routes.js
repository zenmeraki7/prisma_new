import express from "express";

import { listBulkEditJobsController } from "../controllers/bulkEdit/bulkEditHistory.controller.js";

import {
  listBulkEditPresetsController,
  getBulkEditPresetController,
  createBulkEditPresetController,
  updateBulkEditPresetController,
  deleteBulkEditPresetController,
} from "../controllers/bulkEdit/bulkEditPreset.controller.js";
import { runBulkEditPresetController } from "../controllers/bulkEdit/bulkEditPresetRun.controller.js";

import {
  createBulkEditJobController,
  getBulkEditJobController,
} from "../controllers/bulkEdit/bulkEdit.controller.js";

import { retryFailedBulkEditJobController } from "../controllers/bulkEdit/bulkEditRetry.controller.js";
import { downloadBulkEditFailuresCsvController } from "../controllers/bulkEdit/bulkEditFailures.controller.js";
import { bulkOperationsFinishWebhookController } from "../controllers/bulkEdit/bulkEditWebhook.controller.js";
import { getBulkEditJobByIdController, getBulkEditJobsController } from "../controllers/bulkEdit/getBulkEditJob.controller.js";
import { cancelBulkEditJobController } from "../controllers/bulkEdit/cancelBulkEditJob.controller.js";

const router = express.Router();

router.post("/bulk-edit/jobs", createBulkEditJobController);
router.get("/bulk-edit/jobs", getBulkEditJobsController);
router.get("/bulk-edit/jobs/:id", getBulkEditJobByIdController);
router.post("/bulk-edit/jobs/:id/cancel", cancelBulkEditJobController);

router.get("/api/bulk-edit/presets", listBulkEditPresetsController);
router.post("/api/bulk-edit/presets", createBulkEditPresetController);
router.get("/api/bulk-edit/presets/:id", getBulkEditPresetController);
router.put("/api/bulk-edit/presets/:id", updateBulkEditPresetController);
router.delete("/api/bulk-edit/presets/:id", deleteBulkEditPresetController);
router.post("/api/bulk-edit/presets/:id/run", runBulkEditPresetController);

router.get("/api/bulk-edit/jobs", listBulkEditJobsController);
router.post("/api/bulk-edit/jobs", createBulkEditJobController);
router.get("/api/bulk-edit/jobs/:id", getBulkEditJobController);
router.post("/api/bulk-edit/jobs/:id/retry-failed", retryFailedBulkEditJobController);
router.get("/api/bulk-edit/jobs/:id/failures.csv", downloadBulkEditFailuresCsvController);

router.post("/webhooks/bulk-operations-finish", bulkOperationsFinishWebhookController);

router.post("/jobs", createBulkEditJobController);
router.get("/jobs/:id", getBulkEditJobController);

export default router;