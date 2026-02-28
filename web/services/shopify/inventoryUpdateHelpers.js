// FILE: web/services/shopify/inventoryUpdateHelpers.js

import logger from "../../utils/logger.server.js";
import { OPS, OP_TYPES } from "../bulkService/bulkEditRegistry.server.js";

/* -------------------------------------------------------------------------- */
/*  GraphQL documents                                                         */
/* -------------------------------------------------------------------------- */

const INVENTORY_ADJUST_QUANTITIES_MUTATION = `
mutation inventoryAdjustQuantities($input: InventoryAdjustQuantitiesInput!) {
  inventoryAdjustQuantities(input: $input) {
    inventoryAdjustmentGroup {
      id
    }
    userErrors {
      field
      message
    }
  }
}
`;

const INVENTORY_ITEM_UPDATE_MUTATION = `
mutation inventoryItemUpdate($id: ID!, $input: InventoryItemInput!) {
  inventoryItemUpdate(id: $id, input: $input) {
    inventoryItem {
      id
      tracked
      unitCost {
        amount
      }
      measurement {
        weight {
          value
          unit
        }
      }
    }
    userErrors {
      message
      field
    }
  }
}
`;

/* -------------------------------------------------------------------------- */
/*  GID helpers                                                               */
/* -------------------------------------------------------------------------- */

export function toInventoryItemGid(inventoryItemId) {
  if (!inventoryItemId) throw new Error("toInventoryItemGid: inventoryItemId required");
  // Accepts either numeric or existing gid; don't double-wrap.
  const s = String(inventoryItemId);
  if (s.startsWith("gid://shopify/InventoryItem/")) return s;
  return `gid://shopify/InventoryItem/${s}`;
}

export function toLocationGid(locationId) {
  if (!locationId) throw new Error("toLocationGid: locationId required");
  const s = String(locationId);
  if (s.startsWith("gid://shopify/Location/")) return s;
  return `gid://shopify/Location/${s}`;
}

/* -------------------------------------------------------------------------- */
/*  Helpers: slice payload into inventory-related ops                         */
/* -------------------------------------------------------------------------- */

function extractInventoryOps(payload) {
  const ops = payload.operations || [];
  const qtyOps = [];
  const itemOps = [];

  for (const op of ops) {
    if (op.target !== "VARIANT") continue; // inventory ops only valid for variant jobs

    switch (op.field) {
      case OPS.VARIANT_INVENTORY_QUANTITY:
        qtyOps.push(op);
        break;

      case OPS.VARIANT_TRACK_QUANTITY:
      case OPS.VARIANT_COST:
      case OPS.VARIANT_WEIGHT:
        itemOps.push(op);
        break;

      default:
        break;
    }
  }

  return { qtyOps, itemOps };
}

/* -------------------------------------------------------------------------- */
/*  Quantity engine (inventoryAdjustQuantities)                               */
/* -------------------------------------------------------------------------- */

/**
 * Build InventoryAdjustQuantitiesInput from:
 *  - variant inventory mirror row
 *  - VARIANT_INVENTORY_QUANTITY ops in payload
 *
 * Assumes variantRow has:
 *  - inventory_item_id
 *  - default_location_id
 *  - inventory_quantity (current available qty at that location)
 */
function buildInventoryAdjustInput(variantRow, qtyOps) {
  if (!qtyOps.length) return null;

  if (!variantRow.inventory_item_id || !variantRow.default_location_id) {
    logger.warn(
      "[inventoryUpdateHelpers] Variant row missing inventory_item_id/default_location_id; skipping quantity adjustment",
      {
        shopify_variant_id: variantRow.shopify_variant_id,
      },
    );
    return null;
  }

  const current = Number(variantRow.inventory_quantity ?? 0);
  if (!Number.isFinite(current)) {
    logger.warn(
      "[inventoryUpdateHelpers] Invalid current inventory_quantity; skipping quantity adjustment",
      {
        shopify_variant_id: variantRow.shopify_variant_id,
        inventory_quantity: variantRow.inventory_quantity,
      },
    );
    return null;
  }

  // For v1, we only support ONE qty op per payload.
  const op = qtyOps[0];

  let delta = 0;

  if (op.op === OP_TYPES.SET_ABSOLUTE) {
    const desired = Number(op.value);
    if (!Number.isFinite(desired)) {
      throw new Error("inventoryBulk: SET_ABSOLUTE requires numeric value");
    }
    delta = desired - current;
  } else if (op.op === OP_TYPES.INCREMENT_ABSOLUTE) {
    const d = Number(op.value);
    if (!Number.isFinite(d)) {
      throw new Error("inventoryBulk: INCREMENT_ABSOLUTE requires numeric value");
    }
    delta = d;
  } else {
    // Registry should have blocked this already
    throw new Error(`inventoryBulk: unsupported op for VARIANT_INVENTORY_QUANTITY: ${op.op}`);
  }

  if (delta === 0) {
    // Nothing to do
    return null;
  }

  return {
    changes: [
      {
        inventoryItemId: toInventoryItemGid(variantRow.inventory_item_id),
        locationId: toLocationGid(variantRow.default_location_id),
        delta,
      },
    ],
  };
}

/* -------------------------------------------------------------------------- */
/*  InventoryItem engine (inventoryItemUpdate)                                */
/* -------------------------------------------------------------------------- */

/**
 * Build InventoryItemInput from:
 *  - variant mirror row (which must expose inventory_item_id)
 *  - VARIANT_TRACK_QUANTITY / VARIANT_COST / VARIANT_WEIGHT ops
 *
 * Assumes:
 *  - Your mirror row has `inventory_item_id` field
 *  - Weight value is in your store's base unit (we'll send as KILOGRAMS or whatever you decide)
 */
function buildInventoryItemUpdateInput(variantRow, itemOps, weightUnit = "KILOGRAMS") {
  if (!itemOps.length) return null;

  if (!variantRow.inventory_item_id) {
    logger.warn(
      "[inventoryUpdateHelpers] Variant row missing inventory_item_id; skipping inventoryItemUpdate",
      { shopify_variant_id: variantRow.shopify_variant_id },
    );
    return null;
  }

  const input = {};
  let hasChanges = false;

  for (const op of itemOps) {
    switch (op.field) {
      case OPS.VARIANT_TRACK_QUANTITY: {
        // value already normalized to boolean by registry
        input.tracked = Boolean(op.value);
        hasChanges = true;
        break;
      }

      case OPS.VARIANT_COST: {
        const n = Number(op.value);
        if (!Number.isFinite(n)) {
          throw new Error("inventoryBulk: VARIANT_COST requires numeric value");
        }
        // Shopify expects cost as Money; scalar in InventoryItemInput is `cost`
        input.cost = n;
        hasChanges = true;
        break;
      }

      case OPS.VARIANT_WEIGHT: {
        const current = Number(variantRow.weight ?? 0);
        if (!Number.isFinite(current)) {
          // If current is invalid, just treat as 0 for relative ops
        }

        let next = current;
        if (op.op === OP_TYPES.SET) {
          next = Number(op.value);
        } else if (op.op === OP_TYPES.INCREMENT_ABSOLUTE) {
          next = current + Number(op.value);
        } else if (op.op === OP_TYPES.INCREMENT_PERCENT) {
          next = current * (1 + Number(op.value) / 100);
        } else {
          throw new Error(`inventoryBulk: unsupported op for VARIANT_WEIGHT: ${op.op}`);
        }

        if (!Number.isFinite(next) || next < 0) {
          throw new Error("inventoryBulk: VARIANT_WEIGHT resulted in invalid weight");
        }

        const roundTo = op.roundTo ?? 3;
        const factor = 10 ** roundTo;
        next = Math.round(next * factor) / factor;

        input.measurement = input.measurement || {};
        input.measurement.weight = {
          value: next,
          unit: weightUnit, // you can map this from shop settings later
        };
        hasChanges = true;
        break;
      }

      default:
        break;
    }
  }

  if (!hasChanges) return null;

  return {
    id: toInventoryItemGid(variantRow.inventory_item_id),
    input,
  };
}

/* -------------------------------------------------------------------------- */
/*  Public API used by bulkEditWorker.pg.js                                   */
/* -------------------------------------------------------------------------- */

/**
 * Apply inventory-related bulk ops for a single variant.
 *
 * - Uses inventoryAdjustQuantities for quantity delta/absolute.
 * - Uses inventoryItemUpdate for tracked / cost / weight.
 *
 * @param {Object} params
 * @param {Object} params.shopSession
 * @param {Object} params.variantRow  row from variant mirror (must include inventory fields)
 * @param {Object} params.payload     normalized BulkEditPayloadV1
 * @param {Function} params.graphQLClient  (session, query, vars) => Promise<any>
 */
export async function applyInventoryBulkOps({
  shopSession,
  variantRow,
  payload,
  graphQLClient,
}) {
  const { qtyOps, itemOps } = extractInventoryOps(payload);

  if (!qtyOps.length && !itemOps.length) {
    return { adjustedQuantity: false, updatedItem: false };
  }

  const weightUnit = "KILOGRAMS"; // TODO: resolve from shop settings if you care

  // 1) inventoryAdjustQuantities for qty
  let adjustedQuantity = false;
  const adjustInputCore = buildInventoryAdjustInput(variantRow, qtyOps);
  if (adjustInputCore) {
    const adjustInput = {
      ...adjustInputCore,
      // optional metadata to show in Shopify adjustment history
      reason: "correction",
      referenceDocumentUri: "gid://metamatrix/bulk-edit", // or some URL you want
    };

    const result = await graphQLClient(
      shopSession,
      INVENTORY_ADJUST_QUANTITIES_MUTATION,
      { input: adjustInput },
    );

    const userErrors =
      result?.data?.inventoryAdjustQuantities?.userErrors ||
      result?.inventoryAdjustQuantities?.userErrors ||
      [];

    if (userErrors.length) {
      logger.warn("[inventoryUpdateHelpers] inventoryAdjustQuantities userErrors", {
        shop: shopSession.shopDomain,
        variantId: variantRow.shopify_variant_id,
        errors: userErrors,
      });
      throw new Error(`Shopify inventoryAdjustQuantities userErrors: ${JSON.stringify(userErrors)}`);
    }

    adjustedQuantity = true;
  }

  // 2) inventoryItemUpdate for tracked / cost / weight
  let updatedItem = false;
  const itemInput = buildInventoryItemUpdateInput(variantRow, itemOps, weightUnit);
  if (itemInput) {
    const result = await graphQLClient(
      shopSession,
      INVENTORY_ITEM_UPDATE_MUTATION,
      {
        id: itemInput.id,
        input: itemInput.input,
      },
    );

    const userErrors =
      result?.data?.inventoryItemUpdate?.userErrors ||
      result?.inventoryItemUpdate?.userErrors ||
      [];

    if (userErrors.length) {
      logger.warn("[inventoryUpdateHelpers] inventoryItemUpdate userErrors", {
        shop: shopSession.shopDomain,
        inventoryItemId: itemInput.id,
        errors: userErrors,
      });
      throw new Error(`Shopify inventoryItemUpdate userErrors: ${JSON.stringify(userErrors)}`);
    }

    updatedItem = true;
  }

  return { adjustedQuantity, updatedItem };
}