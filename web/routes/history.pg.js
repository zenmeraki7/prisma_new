// FILE: web/routes/history.pg.js

import express from "express";
import { getEditHistoryByBulkJobController } from "../controllers/history/editHistoryController.pg.js";
// import { validateAuthenticatedSession } from "../shopify.js";

export const historyPgRouter = express.Router();

// historyPgRouter.use(validateAuthenticatedSession);

historyPgRouter.get(
  "/edit-history/by-bulk/:id",
  getEditHistoryByBulkJobController,
);