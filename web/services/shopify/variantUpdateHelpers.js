// FILE: web/services/shopify/variantUpdateHelpers.js

import logger from "../../utils/logger.server.js";
import { OPS } from "../bulkService/bulkEditRegistry.server.js";

const PRODUCT_VARIANT_UPDATE_MUTATION = `
mutation productVariantUpdate($input: ProductVariantInput!) {
  productVariantUpdate(input: $input) {
    productVariant {
      id
      price
      compareAtPrice
      taxable
      inventoryPolicy
      requiresShipping
      sku
      barcode
    }
    userErrors {
      field
      message
    }
  }
}
`;

/**
 * Convert numeric Shopify variant ID → GID.
 */
export function toVariantGid(shopifyVariantId) {
  return `gid://shopify/ProductVariant/${shopifyVariantId}`;
}

/**
 * Compute next numeric value based on current & operation.
 * Used for price / compare-at / (future) weight.
 */
function computeNewNumber(currentRaw, op) {
  const current = Number(currentRaw ?? 0);
  if (!Number.isFinite(current)) {
    throw new Error(`Invalid current number: ${currentRaw}`);
  }

  let next = current;

  switch (op.op) {
    case "SET":
      next = Number(op.value);
      break;
    case "INCREMENT_PERCENT":
      next = current * (1 + Number(op.value) / 100);
      break;
    case "INCREMENT_ABSOLUTE":
      next = current + Number(op.value);
      break;
    default:
      throw new Error(`Unsupported numeric op: ${op.op}`);
  }

  const roundTo = op.roundTo ?? 2;
  const factor = 10 ** roundTo;
  next = Math.round(next * factor) / factor;

  return next;
}

/**
 * Builds ProductVariantInput from variant_mirror row + BulkEditPayloadV1.
 *
 * Handles VARIANT_* fields that are supported by productVariantUpdate.
 *
 * NOTE: Weight in latest Shopify Admin GraphQL is generally modeled via
 * inventoryItem.measurement.weight (productSet / productVariantsBulkUpdate),
 * so VARIANT_WEIGHT is *not* wired here yet. We'll ignore it for now rather
 * than silently send a broken mutation.
 */
export function buildVariantUpdateInputFromPayload(variantRow, payload) {
  if (!payload || payload.version !== 1) return null;

  const input = {
    id: toVariantGid(variantRow.shopify_variant_id),
  };

  let hasChanges = false;

  for (const op of payload.operations || []) {
    if (op.target !== "VARIANT") continue;

    switch (op.field) {
      /* ───────────── Price / Compare-at ───────────── */

      case OPS.VARIANT_PRICE: {
        const newPrice = computeNewNumber(variantRow.price, op);
        input.price = newPrice.toString();
        hasChanges = true;
        break;
      }

      case OPS.VARIANT_COMPARE_AT_PRICE: {
        const newPrice = computeNewNumber(variantRow.compare_at_price, op);
        input.compareAtPrice = newPrice.toString();
        hasChanges = true;
        break;
      }

      /* ───────────── Tax / Inventory Policy ───────────── */

      case OPS.VARIANT_TAXABLE: {
        // value already normalized to boolean by registry validator
        input.taxable = Boolean(op.value);
        hasChanges = true;
        break;
      }

      case OPS.VARIANT_INVENTORY_POLICY: {
        // Registry already enforces enum DENY | CONTINUE
        input.inventoryPolicy = String(op.value).toUpperCase();
        hasChanges = true;
        break;
      }

      /* ───────────── Physical product / shipping ───────────── */

      case OPS.VARIANT_PHYSICAL_PRODUCT: {
        // Shopify: requiresShipping controls "Physical product" checkbox
        input.requiresShipping = Boolean(op.value);
        hasChanges = true;
        break;
      }

      /* ───────────── Identifiers ───────────── */

      case OPS.VARIANT_SKU: {
        input.sku = String(op.value ?? "");
        hasChanges = true;
        break;
      }

      case OPS.VARIANT_BARCODE: {
        input.barcode = String(op.value ?? "");
        hasChanges = true;
        break;
      }

      /* ───────────── Weight (NOT WIRED YET) ───────────── */

      case OPS.VARIANT_WEIGHT: {
        // In latest Admin GraphQL, weight is controlled via
        // inventoryItem.measurement.weight inside productSet or
        // productVariantsBulkUpdate, *not* simple productVariantUpdate.
        //
        // To avoid misleading behaviour, we ignore this in V1 and rely
        // on a dedicated inventoryItem pipeline later.
        //
        // You can log a warning so you see if UI accidentally uses it.
        logger.warn(
          "[variantUpdateHelpers] VARIANT_WEIGHT op received but not wired to GraphQL yet",
          {
            variantId: variantRow.shopify_variant_id,
            op,
          },
        );
        break;
      }

      default:
        // Ignore unknown / future fields for forward compatibility
        break;
    }
  }

  if (!hasChanges) return null;
  return input;
}

/**
 * Executes productVariantUpdate with the built input.
 *
 * @param {object} shopSession
 * @param {object} variantRow  - row from variant_mirror
 * @param {BulkEditPayloadV1} payload
 * @param {function} graphQLClient - (session, query, variables) => Promise<any>
 */
export async function applyVariantBulkOps({
  shopSession,
  variantRow,
  payload,
  graphQLClient,
}) {
  const input = buildVariantUpdateInputFromPayload(variantRow, payload);
  if (!input) {
    return { updated: false };
  }

  const result = await graphQLClient(
    shopSession,
    PRODUCT_VARIANT_UPDATE_MUTATION,
    { input },
  );

  const userErrors =
    result?.data?.productVariantUpdate?.userErrors ||
    result?.productVariantUpdate?.userErrors ||
    [];

  if (userErrors.length) {
    const msg = JSON.stringify(userErrors);
    logger.warn("[variantUpdateHelpers] productVariantUpdate userErrors", {
      variantId: variantRow.shopify_variant_id,
      errors: userErrors,
    });
    throw new Error(`Shopify productVariantUpdate userErrors: ${msg}`);
  }

  const updatedId =
    result?.data?.productVariantUpdate?.productVariant?.id ||
    result?.productVariantUpdate?.productVariant?.id ||
    input.id;

  return {
    updated: true,
    variantGid: updatedId,
  };
}