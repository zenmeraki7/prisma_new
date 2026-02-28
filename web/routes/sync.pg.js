// FILE: web/routes/sync.pg.js

import express from "express";
import { validateAuthenticatedSession } from "../shopify.js";
import { startFullCatalogSyncController } from "../controllers/sync/syncController.pg.js";

const router = express.Router();

router.post(
  "/sync/start",
  validateAuthenticatedSession(), // your existing online/offline session guard
  startFullCatalogSyncController,
);

export default router;