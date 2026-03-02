// FILE: web/routes/sync.pg.js

import express from "express";
import shopify from "../shopify.js"; // import default shopify instance
import { startFullCatalogSyncController } from "../controllers/sync/syncController.pg.js";

const router = express.Router();

router.post(
  "/sync/start",
  shopify.validateAuthenticatedSession(), // <-- correct usage
  startFullCatalogSyncController,
);

export default router;