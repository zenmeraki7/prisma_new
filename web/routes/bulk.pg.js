// FILE: web/routes/bulk.pg.js

import express from "express";
import {
  createBulkEditJobController,
  listBulkJobsController,
  getBulkJobController,
  cancelBulkJobController,
} from "../controllers/bulkService/bulkEditController.pg.js";
// import { validateAuthenticatedSession } from "../shopify.js";
import { getBulkEditFieldDefsController } from "../controllers/bulkService/bulkEditMetaController.pg.js";

export const bulkPgRouter = express.Router();

// bulkPgRouter.use(validateAuthenticatedSession);

bulkPgRouter.get("/bulk/fields", getBulkEditFieldDefsController);

bulkPgRouter.post("/bulk/edit", createBulkEditJobController);
bulkPgRouter.get("/bulk/jobs", listBulkJobsController);
bulkPgRouter.get("/bulk/jobs/:id", getBulkJobController);
bulkPgRouter.post("/bulk/jobs/:id/cancel", cancelBulkJobController);