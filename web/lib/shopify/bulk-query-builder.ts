// FILE: web/lib/shopify/bulk-query-builder.ts

import { FILTER_REGISTRY, type FilterKey } from "../filters/registry";

/**
 * Build the Shopify Bulk Operation GraphQL mutation for SNAPSHOT plane.
 *
 * - `activeFilterKeys`: which snapshot filters the user is actually using
 *   (e.g. ["product.description", "product.seoTitle"]).
 * - `candidateProductIds`: the product IDs (Shopify IDs) you've selected
 *   from the FAST plane (ProductLite) using FilterPlanner + Prisma.
 *
 * We keep the selection set minimal:
 * - Always fetch `id` and `handle` so we can join back to ProductLite.
 * - Only fetch description/SEO fields if needed by filters.
 */
export function buildSnapshotBulkQuery(
  activeFilterKeys: FilterKey[],
  candidateProductIds: string[],
): string {
  // 1. Identify which fields we actually need from Shopify
  const needsDescription = activeFilterKeys.includes("product.description");

  const needsSeo = activeFilterKeys.some((k) =>
    [
      "product.seoTitle",
      "product.seoDescription",
      "product.searchEngineVisibility",
    ].includes(k),
  );

  // 2. Build product selection set
  // Always fetch ID + handle
  let productFields = `
    id
    handle
  `;

  if (needsDescription) {
    // Shopify: descriptionHtml or description
    productFields += `
    descriptionHtml
    `;
  }

  if (needsSeo) {
    productFields += `
    seo {
      title
      description
    }
    `;
    // searchEngineVisibility is not a first-class Shopify field;
    // you can derive it later from published/unpublished + onlineStorePreview, etc.
    // If you later map a raw Shopify field, add it here.
  }

  // 3. Build product query string based on candidate IDs
  //   Shopify product search syntax: query: "id:123 OR id:456"
  //   If you already store numeric IDs, adapt accordingly.
  const idClauses = candidateProductIds
    .map((id) => `id:${id}`)
    .join(" OR ");

  const productsQuery = idClauses || ""; // if empty, Shopify will just return nothing

  // 4. Construct the Bulk Operation mutation
  // NOTE:
  // - We embed the inner query string via triple quotes.
  // - The outer mutation is what you send via shopifyGraphqlRequest.
  const graphql = `
    mutation {
      bulkOperationRunQuery(
        query: """
        {
          products(query: "${productsQuery}", first: 250) {
            edges {
              node {
                ${productFields}
              }
            }
          }
        }
        """
      ) {
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

  return graphql;
}
