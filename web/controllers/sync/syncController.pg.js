// FILE: web/controllers/sync/syncController.pg.js

import { startFullCatalogSyncPg } from "../../services/syncService/syncCoordinator.pg.js";

/**
 * POST /api/pg/sync/start
 * Body: { shopId?: number }
 *  - Or derive shopId from your session middleware.
 */
export async function startFullCatalogSyncController(req, res, next) {
  try {
    // If you store shopId on req.user / res.locals, read from there
    const shopId = req.body.shopId || req.user?.shopId || res.locals.shopId;
    if (!shopId) {
      return res.status(400).json({ error: "shopId required" });
    }

    const result = await startFullCatalogSyncPg({ shopId });

    res.json({
      ok: true,
      sync: result,
    });
  } catch (err) {
    next(err);
  }
}