// FILE: web/controllers/bulkEditPresetRun.controller.js

import { getBulkEditPresetById } from "../../repositories/bulkEditPreset.repository.js";
import { createBulkEditJobController } from "./bulkEdit.controller.js";

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
 * POST /api/bulk-edit/presets/:id/run
 *
 * Reuses the preset's stored filterExpr + action/value
 */
export async function runBulkEditPresetController(req, res) {
  const shopId = extractShop(req);
  const presetId = req.params?.id;

  if (!shopId || !presetId) {
    return res.status(400).json({
      ok: false,
      error: "Missing shop or preset id",
    });
  }

  const preset = await getBulkEditPresetById({ shopId, presetId });

  if (!preset) {
    return res.status(404).json({
      ok: false,
      error: "Preset not found",
    });
  }

  req.body = {
    scope: preset.scope,
    fieldKey: preset.fieldKey,
    action: preset.action,
    value: preset.valueJson,
    filterExpr: preset.filterExprJson,
  };

  return createBulkEditJobController(req, res);
}