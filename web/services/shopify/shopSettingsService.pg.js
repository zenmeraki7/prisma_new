// FILE: web/services/shopify/shopSettingsService.pg.js

import { shopifyGraphQLClient } from "./shopifyGraphQLClient.js";
import { getShopSessionForShopId } from "./shopSessionService.pg.js";
import { pool } from "../../db/postgres/pool.js";

const LOCATIONS_QUERY = `
query Locations {
  locations(first: 50) {
    edges {
      node {
        id
        name
        legacyResourceId
        isActive
      }
    }
  }
}
`;

export async function ensureShopDefaultLocation(shopId) {
  const session = await getShopSessionForShopId(shopId);
  const result = await shopifyGraphQLClient(session, LOCATIONS_QUERY, {});
  const edges = result?.data?.locations?.edges || [];

  if (!edges.length) return null;

  // pick first active location as default (you can improve this rule later)
  const node = edges.find((e) => e.node.isActive) || edges[0];
  const legacyId = node.node.legacyResourceId;
  const numericId = Number(legacyId);

  await pool.query(
    `
    UPDATE shops
    SET default_location_id = $2, updated_at = NOW()
    WHERE id = $1
  `,
    [shopId, numericId],
  );

  return numericId;
}