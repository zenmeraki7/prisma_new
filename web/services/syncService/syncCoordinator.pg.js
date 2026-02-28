// FILE: web/services/syncService/syncCoordinator.pg.js

import { pool } from "../../db/postgres/pool.js";
import logger from "../../utils/logger.server.js";

import { getShopSessionForShopId } from "../shopify/shopSessionService.pg.js";
import { shopifyGraphQLClient } from "../shopify/shopifyGraphQLClient.js";

import { runProductMirrorBulkWorker } from "./productMirrorBulkWorker.pg.js";
import { runVariantMirrorBulkWorker } from "./variantMirrorBulkWorker.pg.js";
import { runVariantInventoryMirrorBulkWorker } from "./variantInventoryMirrorBulkWorker.pg.js";

/* -------------------------------------------------------------------------- */
/*  BulkOperation GraphQL payloads                                            */
/* -------------------------------------------------------------------------- */

/**
 * NOTE:
 *  - Adjust these queries to exactly match the fields you're mapping
 *    in the mirror workers.
 *  - They MUST be wrapped as a single query inside bulkOperationRunQuery.
 */

const PRODUCTS_BULK_QUERY = `
{
  products {
    edges {
      node {
        id
        title
        handle
        status
        productType
        vendor
        templateSuffix
        tags
        publishedAt
        createdAt
        updatedAt
        onlineStoreUrl
        seo {
          title
          description
        }
      }
    }
  }
}
`;

const VARIANTS_BULK_QUERY = `
{
  productVariants {
    edges {
      node {
        id
        title
        sku
        barcode
        price
        compareAtPrice
        taxable
        inventoryPolicy
        requiresShipping
        createdAt
        updatedAt
        product {
          id
        }
        weight
        weightUnit
        inventoryItem {
          id
          tracked
          cost
          unitCost {
            amount
          }
        }
      }
    }
  }
}
`;

const INVENTORY_BULK_QUERY = `
{
  inventoryLevels {
    edges {
      node {
        id
        available
        location {
          id
          name
        }
        inventoryItem {
          id
        }
      }
    }
  }
}
`;

const BULK_OPERATION_RUN_QUERY = `
mutation bulkOperationRunQuery($query: String!) {
  bulkOperationRunQuery(query: $query) {
    bulkOperation {
      id
      status
    }
    userErrors {
      field
      message
    }
  }
}
`;

/* -------------------------------------------------------------------------- */
/*  Helper to run a bulk operation                                            */
/* -------------------------------------------------------------------------- */

async function runBulkOperation({ shopSession, query, source }) {
  const result = await shopifyGraphQLClient(shopSession, BULK_OPERATION_RUN_QUERY, {
    query,
  });

  const payload =
    result?.data?.bulkOperationRunQuery ||
    result?.bulkOperationRunQuery ||
    null;

  if (!payload) {
    throw new Error(`bulkOperationRunQuery.${source}: missing payload`);
  }

  const userErrors = payload.userErrors || [];
  if (userErrors.length) {
    logger.error("[syncCoordinator.pg] bulkOperationRunQuery userErrors", {
      shop: shopSession.shopDomain,
      source,
      userErrors,
    });
    throw new Error(
      `bulkOperationRunQuery.${source}.userErrors: ${JSON.stringify(userErrors)}`,
    );
  }

  const bulkOp = payload.bulkOperation;
  if (!bulkOp?.id) {
    throw new Error(`bulkOperationRunQuery.${source}: missing bulkOperation.id`);
  }

  return {
    id: bulkOp.id,      // GID string
    status: bulkOp.status,
  };
}

/* -------------------------------------------------------------------------- */
/*  sync_history helpers                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Create a sync_history row for a bulk operation.
 *
 * Columns assumed on sync_history:
 *  - id (PK)
 *  - shop_id
 *  - sync_type         (e.g. 'CATALOG_FULL')
 *  - source            ('PRODUCTS' | 'VARIANTS' | 'INVENTORY')
 *  - bulk_operation_id (text)
 *  - status            ('queued' | 'running' | 'completed' | 'failed')
 *  - processed_count   (int)
 *  - created_at / updated_at / started_at / finished_at
 *  - error_message (optional)
 */
async function createSyncHistoryRow({ shopId, syncType, source, bulkOperationId }) {
  const sql = `
    INSERT INTO sync_history (
      shop_id,
      sync_type,
      source,
      bulk_operation_id,
      status,
      processed_count,
      created_at,
      updated_at
    )
    VALUES ($1, $2, $3, $4, 'queued', 0, NOW(), NOW())
    RETURNING id
  `;

  const { rows } = await pool.query(sql, [
    shopId,
    syncType,
    source,
    bulkOperationId,
  ]);

  return rows[0].id;
}

/**
 * Given a bulkOperation.id from Shopify, find the matching sync_history row.
 */
async function findSyncHistoryByBulkOperation({ shopId, bulkOperationId }) {
  const sql = `
    SELECT id, shop_id, source, sync_type
    FROM sync_history
    WHERE shop_id = $1
      AND bulk_operation_id = $2
    ORDER BY created_at DESC
    LIMIT 1
  `;

  const { rows } = await pool.query(sql, [shopId, bulkOperationId]);
  return rows[0] || null;
}

/* -------------------------------------------------------------------------- */
/*  Public API: kick off full catalog sync                                    */
/* -------------------------------------------------------------------------- */

/**
 * Kick off product + variant + inventory bulk operations for a shop and
 * create sync_history rows for each.
 *
 * Returns numeric PG sync_history ids for each operation.
 */
export async function startFullCatalogSyncPg({ shopId, syncType = "CATALOG_FULL" }) {
  if (!shopId) throw new Error("startFullCatalogSyncPg: shopId required");

  const shopSession = await getShopSessionForShopId(shopId);

  // 1) Products bulk op
  const productBulk = await runBulkOperation({
    shopSession,
    query: PRODUCTS_BULK_QUERY,
    source: "PRODUCTS",
  });
  const productSyncHistoryId = await createSyncHistoryRow({
    shopId,
    syncType,
    source: "PRODUCTS",
    bulkOperationId: productBulk.id,
  });

  // 2) Variants bulk op
  const variantBulk = await runBulkOperation({
    shopSession,
    query: VARIANTS_BULK_QUERY,
    source: "VARIANTS",
  });
  const variantSyncHistoryId = await createSyncHistoryRow({
    shopId,
    syncType,
    source: "VARIANTS",
    bulkOperationId: variantBulk.id,
  });

  // 3) InventoryLevels bulk op
  const inventoryBulk = await runBulkOperation({
    shopSession,
    query: INVENTORY_BULK_QUERY,
    source: "INVENTORY",
  });
  const inventorySyncHistoryId = await createSyncHistoryRow({
    shopId,
    syncType,
    source: "INVENTORY",
    bulkOperationId: inventoryBulk.id,
  });

  logger.info("[syncCoordinator.pg] Started full catalog sync", {
    shopId,
    syncType,
    productBulkId: productBulk.id,
    variantBulkId: variantBulk.id,
    inventoryBulkId: inventoryBulk.id,
    productSyncHistoryId,
    variantSyncHistoryId,
    inventorySyncHistoryId,
  });

  return {
    productSyncHistoryId,
    variantSyncHistoryId,
    inventorySyncHistoryId,
  };
}

/* -------------------------------------------------------------------------- */
/*  Public API: dispatch bulk result from webhook                             */
/* -------------------------------------------------------------------------- */

/**
 * Called by your bulk-operation finish webhook when Shopify sends:
 *   - bulkOperation.id
 *   - bulkOperation.status (must be COMPLETED)
 *   - bulkOperation.url  (JSONL download URL)
 *
 * This function:
 *  - Finds matching sync_history row to determine source (PRODUCTS / VARIANTS / INVENTORY)
 *  - Streams JSONL
 *  - Dispatches to appropriate worker
 */
export async function dispatchBulkOperationResultPg({
  shopId,
  bulkOperationId,
  bulkOperationUrl,
  defaultLocationId,
}) {
  if (!shopId) throw new Error("dispatchBulkOperationResultPg: shopId required");
  if (!bulkOperationId) {
    throw new Error("dispatchBulkOperationResultPg: bulkOperationId required");
  }
  if (!bulkOperationUrl) {
    throw new Error("dispatchBulkOperationResultPg: bulkOperationUrl required");
  }

  const syncHistory = await findSyncHistoryByBulkOperation({
    shopId,
    bulkOperationId,
  });

  if (!syncHistory) {
    logger.warn("[syncCoordinator.pg] No sync_history row found for bulkOperation", {
      shopId,
      bulkOperationId,
    });
    return;
  }

  const { id: syncHistoryId, source } = syncHistory;

  // Fetch JSONL as stream
  const response = await fetch(bulkOperationUrl);
  if (!response.ok || !response.body) {
    throw new Error(
      `dispatchBulkOperationResultPg: failed to fetch ${source} JSONL result`,
    );
  }

  logger.info("[syncCoordinator.pg] Dispatching bulk operation result", {
    shopId,
    bulkOperationId,
    source,
    syncHistoryId,
  });

  switch (source) {
    case "PRODUCTS":
      await runProductMirrorBulkWorker({
        shopId,
        syncHistoryId,
        jsonlStream: response.body,
      });
      break;

    case "VARIANTS":
      await runVariantMirrorBulkWorker({
        shopId,
        syncHistoryId,
        jsonlStream: response.body,
      });
      break;

    case "INVENTORY":
      // defaultLocationId is required for inventory rollups
      if (!defaultLocationId) {
        logger.warn(
          "[syncCoordinator.pg] defaultLocationId missing for INVENTORY sync; inventory rollups may be incorrect",
          { shopId, syncHistoryId },
        );
      }
      await runVariantInventoryMirrorBulkWorker({
        shopId,
        syncHistoryId,
        jsonlStream: response.body,
        defaultLocationId,
      });
      break;

    default:
      logger.warn("[syncCoordinator.pg] Unknown sync_history.source; skipping", {
        shopId,
        source,
        syncHistoryId,
      });
  }
}