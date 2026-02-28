// FILE: web/services/shopify/productUpdateHelpers.js

import logger from "../../utils/logger.server.js";
// import { shopifyGraphQLRequest } from "./shopifyClient.js"; // whatever client you use

const PRODUCT_UPDATE_MUTATION = `
mutation productUpdate($input: ProductInput!) {
  productUpdate(input: $input) {
    product {
      id
      title
      status
      seo {
        title
        description
      }
    }
    userErrors {
      field
      message
    }
  }
}
`;

/**
 * Convert numeric Shopify product ID → GID.
 * 1234567890 => gid://shopify/Product/1234567890
 */
export function toProductGid(shopifyProductId) {
  return `gid://shopify/Product/${shopifyProductId}`;
}

/**
 * Builds ProductInput from a product_mirror row + BulkEditPayloadV1.
 *
 * NOTE: We only handle PRODUCT-* fields here.
 * Variant operations are handled by variant helpers.
 */
export function buildProductUpdateInputFromPayload(productRow, payload) {
  if (!payload || payload.version !== 1) return null;

  const input = {
    id: toProductGid(productRow.shopify_product_id),
  };

  let hasChanges = false;
  let seo = {}; // we build SEO and attach at the end

  for (const op of payload.operations || []) {
    if (op.target !== "PRODUCT" || op.op !== "SET") continue;

    switch (op.field) {
      case "PRODUCT_TITLE": {
        // support a simple token for original title
        const originalTitle = productRow.title || "";
        let nextTitle = String(op.value ?? "");
        nextTitle = nextTitle.replace("{{originalTitle}}", originalTitle);
        input.title = nextTitle;
        hasChanges = true;
        break;
      }

      case "PRODUCT_STATUS": {
        // Expect "ACTIVE" | "DRAFT" | "ARCHIVED" etc
        input.status = String(op.value ?? "").toUpperCase();
        hasChanges = true;
        break;
      }

      case "PRODUCT_VENDOR": {
        input.vendor = String(op.value ?? "");
        hasChanges = true;
        break;
      }

      case "PRODUCT_PRODUCT_TYPE": {
        input.productType = String(op.value ?? "");
        hasChanges = true;
        break;
      }

      case "PRODUCT_TAGS": {
        // Decide on contract: either full tag set or additive later.
        // For V1 we treat value as full replacement.
        const tags = Array.isArray(op.value)
          ? op.value.map((t) => String(t))
          : String(op.value || "")
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean);

        input.tags = tags;
        hasChanges = true;
        break;
      }

      case "PRODUCT_TEMPLATE_SUFFIX": {
        input.templateSuffix = String(op.value ?? "");
        hasChanges = true;
        break;
      }

      case "PRODUCT_SEO": {
        // value: { title, description }
        if (!op.value || typeof op.value !== "object") break;
        const seoValue = op.value;

        if (seoValue.title != null) {
          seo.title = String(seoValue.title);
        }
        if (seoValue.description != null) {
          seo.description = String(seoValue.description);
        }
        hasChanges = true;
        break;
      }

      default:
        // Ignore unknown product fields for forward compat
        break;
    }
  }

  if (Object.keys(seo).length > 0) {
    // Shopify docs: ProductInput.seo is SEOInput (title + description). :contentReference[oaicite:1]{index=1}
    input.seo = seo;
  }

  if (!hasChanges && !input.seo) {
    return null;
  }

  return input;
}

/**
 * Executes productUpdate with the built input.
 *
 * @param {object} shopSession - includes domain/accessToken (whatever your app uses)
 * @param {object} productRow  - row from product_mirror
 * @param {BulkEditPayloadV1} payload
 * @param {function} graphQLClient - function (session, query, variables) => Promise<any>
 */
export async function applyProductBulkOps({
  shopSession,
  productRow,
  payload,
  graphQLClient,
}) {
  const input = buildProductUpdateInputFromPayload(productRow, payload);
  if (!input) {
    return { updated: false };
  }

  const result = await graphQLClient(shopSession, PRODUCT_UPDATE_MUTATION, {
    input,
  });

  const userErrors =
    result?.data?.productUpdate?.userErrors ||
    result?.productUpdate?.userErrors ||
    [];

  if (userErrors.length) {
    const msg = JSON.stringify(userErrors);
    logger.warn("[productUpdateHelpers] productUpdate userErrors", {
      productId: productRow.shopify_product_id,
      errors: userErrors,
    });
    throw new Error(`Shopify productUpdate userErrors: ${msg}`);
  }

  const updatedId =
    result?.data?.productUpdate?.product?.id ||
    result?.productUpdate?.product?.id ||
    input.id;

  return {
    updated: true,
    productGid: updatedId,
  };
}