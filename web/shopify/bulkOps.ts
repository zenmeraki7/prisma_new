// web/shopify/bulkOps.ts
import { getShopifyAdminClient } from "../shopifyClient";

type BulkOperationStatus = "CREATED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELED";

type BulkOpResult = {
  url: string;
  status: BulkOperationStatus;
};

export async function startProductsFastBootstrapBulkOp(shopId: string): Promise<string> {
  const client = await getShopifyAdminClient(shopId);

  const query = `
    mutation StartFastBootstrap {
      bulkOperationRunQuery(
        query: """
        {
          products {
            edges {
              node {
                id
                title
                handle
                status
                vendor
                productType
                tags
                totalInventory
                collections(first: 50) {
                  edges { node { id } }
                }
                images(first: 1) {
                  edges { node { id } }
                }
                updatedAt
              }
            }
          }
        }
        """
      ) {
        bulkOperation { id status }
        userErrors { field message }
      }
    }
  `;

  const res = await client.request<{
    bulkOperationRunQuery: {
      bulkOperation: { id: string; status: BulkOperationStatus } | null;
      userErrors: { field: string[] | null; message: string }[];
    };
  }>(query);

  const op = res.bulkOperationRunQuery;
  if (op.userErrors.length > 0 || !op.bulkOperation) {
    throw new Error(
      "BulkOp error: " + op.userErrors.map((e) => e.message).join(", ")
    );
  }

  return op.bulkOperation.id;
}

export async function waitForBulkOpResult(
  shopId: string,
  bulkOperationId: string
): Promise<BulkOpResult> {
  const client = await getShopifyAdminClient(shopId);

  while (true) {
    const query = `
      query BulkOpStatus {
        currentBulkOperation {
          id
          status
          url
        }
      }
    `;

    const res = await client.request<{
      currentBulkOperation: { id: string; status: BulkOperationStatus; url: string | null } | null;
    }>(query);

    const op = res.currentBulkOperation;
    if (!op || op.id !== bulkOperationId) {
      throw new Error(`BulkOp ${bulkOperationId} not found`);
    }

    if (op.status === "COMPLETED" && op.url) {
      return { url: op.url, status: op.status };
    }

    if (op.status === "FAILED" || op.status === "CANCELED") {
      throw new Error(`BulkOp failed: ${op.status}`);
    }

    // simple poll
    await new Promise((r) => setTimeout(r, 3000));
  }
}
