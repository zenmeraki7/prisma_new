// FILE: web/services/shopify/bulkOperation.service.js

import shopify from "../../../shopify.js";

const API_VERSION = process.env.SHOPIFY_ADMIN_API_VERSION || "2026-01";

const BULK_OPERATION_RUN_MUTATION = `
mutation bulkOperationRunMutation(
  $mutation: String!,
  $stagedUploadPath: String!
) {
  bulkOperationRunMutation(
    mutation: $mutation,
    stagedUploadPath: $stagedUploadPath
  ) {
    bulkOperation {
      id
      status
      url
      partialDataUrl
      objectCount
      fileSize
      errorCode
      createdAt
      completedAt
    }
    userErrors {
      field
      message
    }
  }
}
`;

const BULK_OPERATION_BY_ID_QUERY = `
query bulkOperation($id: ID!) {
  node(id: $id) {
    ... on BulkOperation {
      id
      status
      url
      partialDataUrl
      objectCount
      fileSize
      errorCode
      createdAt
      completedAt
    }
  }
}
`;

async function getOfflineSessionOrThrow(shop) {
  const offlineId = shopify.api.session.getOfflineId(shop);
  const session = await shopify.sessionStorage.loadSession(offlineId);

  if (!session?.accessToken) {
    throw new Error(`Offline session not found for shop ${shop}`);
  }

  return session;
}

async function adminGraphqlRequest({ shop, query, variables }) {
  const session = await getOfflineSessionOrThrow(shop);

  const response = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": session.accessToken,
    },
    body: JSON.stringify({
      query,
      variables,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Shopify GraphQL HTTP ${response.status}: ${text}`);
  }

  const json = await response.json();

  if (json.errors?.length) {
    throw new Error(
      `Shopify GraphQL error: ${json.errors.map((e) => e.message).join("; ")}`,
    );
  }

  return json.data;
}

export function mapShopifyBulkStatusToLocalStatus(status) {
  switch (status) {
    case "CREATED":
    case "CANCELING":
      return "SUBMITTED";

    case "RUNNING":
      return "RUNNING";

    case "COMPLETED":
      return "COMPLETED";

    case "CANCELED":
    case "FAILED":
    case "EXPIRED":
      return "FAILED";

    default:
      return "RUNNING";
  }
}

export async function runBulkMutation({
  shop,
  mutation,
  stagedUploadPath,
}) {
  const data = await adminGraphqlRequest({
    shop,
    query: BULK_OPERATION_RUN_MUTATION,
    variables: {
      mutation,
      stagedUploadPath,
    },
  });

  const payload = data?.bulkOperationRunMutation;
  const userErrors = payload?.userErrors || [];

  if (userErrors.length > 0) {
    throw new Error(
      `bulkOperationRunMutation failed: ${userErrors.map((e) => e.message).join("; ")}`,
    );
  }

  const bulkOperation = payload?.bulkOperation;
  if (!bulkOperation?.id) {
    throw new Error("bulkOperationRunMutation returned no bulk operation");
  }

  return bulkOperation;
}

export async function getBulkOperationById({
  shop,
  bulkOperationId,
}) {
  const data = await adminGraphqlRequest({
    shop,
    query: BULK_OPERATION_BY_ID_QUERY,
    variables: {
      id: bulkOperationId,
    },
  });

  return data?.node || null;
}