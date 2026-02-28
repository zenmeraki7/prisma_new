// FILE: web/services/shopify/shopifyGraphQLClient.js

import logger from "../../utils/logger.server.js";

/**
 * Minimal Admin GraphQL client for workers / services.
 *
 * @param {import("./shopSessionService.pg.js").ShopSession} session
 * @param {string} query
 * @param {Record<string, any>} variables
 * @returns {Promise<any>} parsed JSON body
 */
export async function shopifyGraphQLClient(session, query, variables = {}) {
  if (!session?.shopDomain || !session?.accessToken) {
    throw new Error("shopifyGraphQLClient: invalid session");
  }

  const { shopDomain, accessToken, apiVersion } = session;

  const endpoint = `https://${shopDomain}/admin/api/${apiVersion}/graphql.json`;

  const body = JSON.stringify({
    query,
    variables,
  });

  let res;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body,
    });
  } catch (err) {
    logger.error("[shopifyGraphQLClient] Network error", {
      shopDomain,
      apiVersion,
      err,
    });
    throw new Error("shopifyGraphQLClient.networkError");
  }

  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch (err) {
    logger.error("[shopifyGraphQLClient] Invalid JSON response", {
      shopDomain,
      apiVersion,
      status: res.status,
      text: text?.slice(0, 500),
    });
    throw new Error("shopifyGraphQLClient.invalidJson");
  }

  if (!res.ok) {
    logger.error("[shopifyGraphQLClient] Non-200 response", {
      shopDomain,
      apiVersion,
      status: res.status,
      body: json,
    });
    throw new Error(`shopifyGraphQLClient.http_${res.status}`);
  }

  // We deliberately do NOT try to interpret userErrors here,
  // because individual helpers (productUpdateHelpers/variantUpdateHelpers)
  // already inspect userErrors and throw their own domain-specific errors.
  if (json.errors && json.errors.length) {
    logger.error("[shopifyGraphQLClient] Top-level GraphQL errors", {
      shopDomain,
      apiVersion,
      errors: json.errors,
    });
    throw new Error("shopifyGraphQLClient.graphqlErrors");
  }

  return json;
}