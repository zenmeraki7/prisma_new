// FILE: web/routes/products.pg.js

import express from "express";
import {
  getProductsPg,
  getVariantsPg,
  getPresetFilter,
} from "../controllers/products/productFilterController.pg.js";
// import { validateAuthenticatedSession } from "../shopify.js"; // your existing auth

export const productsPgRouter = express.Router();

// All these should be behind your Shopify auth middleware in real app.
// productsPgRouter.use(validateAuthenticatedSession);

/**
 * POST /api/pg/products
 * Body: { filters?: FilterGroup, page?, pageSize?, sortKey?, sortDirection? }
 */
productsPgRouter.post("/products", getProductsPg);

/**
 * POST /api/pg/variants
 * Body: { filters?: FilterGroup, page?, pageSize?, sortKey?, sortDirection? }
 */
productsPgRouter.post("/variants", getVariantsPg);

/**
 * GET /api/pg/products/presets/:key
 * e.g. /api/pg/products/presets/low-inventory-variant?threshold=5
 */
productsPgRouter.get("/products/presets/:key", getPresetFilter);