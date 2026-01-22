// web/lib/snapshots/shopifyBulkOp.ts
import fetch from "node-fetch";
import { Shopify } from "@shopify/shopify-api";

type ShopifyClient = ReturnType<typeof Shopify.Clients.Graphql>;

/**
 * Start a Shopify BulkOperation
 * @param client Shopify Admin GraphQL client
 * @param query GraphQL query string
 * @returns BulkOperation ID
 */
export async function startBulkOp(client: ShopifyClient, query: string): Promise<string> {
  const mutation = `
    mutation {
      bulkOperationRunQuery(
        query: """${query}"""
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

  const res = await client.query({ data: mutation });
  const bulkOpId = res.body.data?.bulkOperationRunQuery?.bulkOperation?.id;
  const errors = res.body.data?.bulkOperationRunQuery?.userErrors;

  if (!bulkOpId) {
    throw new Error("Failed to start Shopify BulkOperation: " + JSON.stringify(errors));
  }

  return bulkOpId;
}

/**
 * Wait for BulkOperation to complete and return the JSONL URL
 * @param client Shopify Admin GraphQL client
 * @param bulkOpId BulkOperation ID
 */
export async function waitBulkOpUrl(client: ShopifyClient, bulkOpId: string): Promise<string> {
  while (true) {
    const query = `
      {
        currentBulkOperation {
          id
          status
          objectCount
          url
          errorCode
        }
      }
    `;

    const res = await client.query({ data: query });
    const op = res.body.data.currentBulkOperation;

    if (!op) {
      throw new Error("BulkOperation not found: " + bulkOpId);
    }

    if (op.status === "COMPLETED") {
      if (!op.url) throw new Error("BulkOperation completed but no URL returned.");
      return op.url;
    }

    if (op.status === "FAILED") {
      throw new Error(`BulkOperation failed: ${op.errorCode}`);
    }

    // Poll every 2 seconds
    await new Promise((r) => setTimeout(r, 2000));
  }
}

/**
 * Stream JSONL objects from Shopify BulkOperation URL
 * @param url Shopify BulkOperation JSONL URL
 */
export async function* streamJsonlObjectsFromUrl(url: string): AsyncGenerator<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch JSONL: ${res.status} ${res.statusText}`);

  const reader = res.body?.getReader();
  if (!reader) throw new Error("ReadableStream not supported or missing.");

  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIndex;
    while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) {
        try {
          yield JSON.parse(line);
        } catch (e) {
          console.warn("Failed to parse line:", line, e);
        }
      }
    }
  }

  // leftover
  if (buffer.trim()) {
    try {
      yield JSON.parse(buffer);
    } catch (e) {
      console.warn("Failed to parse last buffer:", buffer, e);
    }
  }
}
