import express from "express";

import { listBulkEditJobsController } from "./controllers/bulkEditHistory.controller.js";

import {
  listBulkEditPresetsController,
  getBulkEditPresetController,
  createBulkEditPresetController,
  updateBulkEditPresetController,
  deleteBulkEditPresetController,
} from "./controllers/bulkEditPreset.controller.js";
import { runBulkEditPresetController } from "./controllers/bulkEditPresetRun.controller.js";

import {
  createBulkEditJobController,
  getBulkEditJobController,
} from "../controllers/bulkEdit.controller.js";

import { retryFailedBulkEditJobController } from "./controllers/bulkEditRetry.controller.js";
import { downloadBulkEditFailuresCsvController } from "./controllers/bulkEditFailures.controller.js";
import { bulkOperationsFinishWebhookController } from "./controllers/bulkEditWebhook.controller.js";

const router = express.Router();

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