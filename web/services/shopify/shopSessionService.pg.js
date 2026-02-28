// FILE: web/services/shopify/shopSessionService.pg.js

import { pool } from "../../db/postgres/pool.js";
import logger from "../../utils/logger.server.js";

/**
 * Simple in-process cache to avoid hitting PG on every single variant.
 * You can swap this for Redis if you like.
 */
const SHOP_SESSION_CACHE = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * @typedef {Object} ShopSession
 * @property {number} shopId
 * @property {string} shopDomain
 * @property {string} accessToken
 * @property {string} apiVersion
 */

/**
 * Fetch a "session-like" object for a given internal shopId.
 * This is what all workers will use to call Shopify GraphQL.
 *
 * Throws if:
 *  - no matching shop row
 *  - shop is uninstalled
 */
export async function getShopSessionForShopId(shopId) {
  if (!shopId) {
    throw new Error("getShopSessionForShopId: shopId is required");
  }

  const cached = SHOP_SESSION_CACHE.get(shopId);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const sql = `
    SELECT id, shop_domain, access_token, api_version, uninstalled_at
    FROM shops
    WHERE id = $1
    LIMIT 1
  `;

  const { rows } = await pool.query(sql, [shopId]);
  if (!rows.length) {
    throw new Error(`getShopSessionForShopId: shop ${shopId} not found`);
  }

  const row = rows[0];

  if (row.uninstalled_at) {
    logger.warn("[shopSessionService] Shop is uninstalled; refusing to create session", {
      shopId,
      shopDomain: row.shop_domain,
    });
    throw new Error("shop.uninstalled");
  }

  /** @type {ShopSession} */
  const session = {
    shopId: row.id,
    shopDomain: row.shop_domain,
    accessToken: row.access_token,
    apiVersion: row.api_version || "2024-01",
  };

  SHOP_SESSION_CACHE.set(shopId, {
    value: session,
    expiresAt: now + CACHE_TTL_MS,
  });

  return session;
}

/**
 * Optional helper to warm/refresh cache after auth.
 */
export function primeShopSessionCache(session) {
  if (!session?.shopId) return;
  SHOP_SESSION_CACHE.set(session.shopId, {
    value: session,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}