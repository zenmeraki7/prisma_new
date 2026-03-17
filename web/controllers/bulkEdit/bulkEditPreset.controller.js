// FILE: web/controllers/bulkEditPreset.controller.js

import {
  listBulkEditPresets,
  getBulkEditPresetById,
  createBulkEditPreset,
  updateBulkEditPreset,
  archiveBulkEditPreset,
} from "../../repositories/bulkEditPreset.repository.js";

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

export async function listBulkEditPresetsController(req, res) {
  try {
    const shopId = extractShop(req);
    const take = Math.min(Number(req.query?.take || 50), 100);

    if (!shopId) {
      return res.status(400).json({ ok: false, error: "Missing shop" });
    }

    const presets = await listBulkEditPresets({ shopId, take });

    return res.status(200).json({
      ok: true,
      presets,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message || "Failed to load presets",
    });
  }
}

export async function getBulkEditPresetController(req, res) {
  try {
    const shopId = extractShop(req);
    const presetId = req.params?.id;

    if (!shopId || !presetId) {
      return res.status(400).json({ ok: false, error: "Missing shop or preset id" });
    }

    const preset = await getBulkEditPresetById({ shopId, presetId });

    if (!preset) {
      return res.status(404).json({ ok: false, error: "Preset not found" });
    }

    return res.status(200).json({
      ok: true,
      preset,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message || "Failed to load preset",
    });
  }
}

export async function createBulkEditPresetController(req, res) {
  try {
    const shopId = extractShop(req);
    if (!shopId) {
      return res.status(400).json({ ok: false, error: "Missing shop" });
    }

    const {
      name,
      description,
      scope,
      fieldKey,
      action,
      value,
      filterExpr,
      isFavorite,
    } = req.body ?? {};

    if (!name || !scope || !fieldKey || !action || !filterExpr) {
      return res.status(400).json({
        ok: false,
        error: "Missing required preset fields",
      });
    }

    const preset = await createBulkEditPreset({
      shopId,
      name: String(name),
      description: description ?? null,
      scope,
      fieldKey,
      action,
      valueJson: value,
      filterExprJson: filterExpr,
      isFavorite: Boolean(isFavorite),
    });

    return res.status(201).json({
      ok: true,
      preset,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message || "Failed to create preset",
    });
  }
}

export async function updateBulkEditPresetController(req, res) {
  try {
    const shopId = extractShop(req);
    const presetId = req.params?.id;

    if (!shopId || !presetId) {
      return res.status(400).json({ ok: false, error: "Missing shop or preset id" });
    }

    const data = {};
    const body = req.body ?? {};

    if ("name" in body) data.name = body.name;
    if ("description" in body) data.description = body.description;
    if ("scope" in body) data.scope = body.scope;
    if ("fieldKey" in body) data.fieldKey = body.fieldKey;
    if ("action" in body) data.action = body.action;
    if ("value" in body) data.valueJson = body.value;
    if ("filterExpr" in body) data.filterExprJson = body.filterExpr;
    if ("isFavorite" in body) data.isFavorite = Boolean(body.isFavorite);
    if ("isArchived" in body) data.isArchived = Boolean(body.isArchived);

    await updateBulkEditPreset({
      shopId,
      presetId,
      data,
    });

    const preset = await getBulkEditPresetById({ shopId, presetId });

    return res.status(200).json({
      ok: true,
      preset,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message || "Failed to update preset",
    });
  }
}

export async function deleteBulkEditPresetController(req, res) {
  try {
    const shopId = extractShop(req);
    const presetId = req.params?.id;

    if (!shopId || !presetId) {
      return res.status(400).json({ ok: false, error: "Missing shop or preset id" });
    }

    await archiveBulkEditPreset({ shopId, presetId });

    return res.status(200).json({
      ok: true,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message || "Failed to archive preset",
    });
  }
}