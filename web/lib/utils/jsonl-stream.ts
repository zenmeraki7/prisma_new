// FILE: web/lib/utils/jsonl-stream.ts

import axios from "axios";
import readline from "readline";

/**
 * Streams a Shopify Bulk Operation JSONL file and processes it
 * line-by-line in fixed-size batches.
 *
 * Guarantees:
 * - Constant memory usage (O(batchSize))
 * - Safe for very large Bulk Ops (100k–1M+ products)
 * - Backpressure-aware (awaits onBatch before continuing)
 *
 * @param url        Shopify bulkOperation result URL
 * @param onBatch    Async handler for each batch of parsed objects
 * @param batchSize  Number of rows per batch (default: 1000)
 */
export async function downloadAndStreamJsonl(
  url: string,
  onBatch: (items: any[]) => Promise<void>,
  batchSize: number = 1000,
): Promise<void> {
  const response = await axios({
    method: "get",
    url,
    responseType: "stream",
    timeout: 60_000, // Shopify bulk files can be large
    decompress: true,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    validateStatus: (status) => status >= 200 && status < 300,
  });

  const rl = readline.createInterface({
    input: response.data,
    crlfDelay: Infinity,
  });

  let batch: any[] = [];

  for await (const line of rl) {
    if (!line || !line.trim()) continue;

    let parsed: any;
    try {
      parsed = JSON.parse(line);
    } catch (err) {
      // Shopify sometimes emits malformed or metadata lines
      console.warn("[jsonl-stream] Failed to parse JSONL line, skipping");
      continue;
    }

    /**
     * Shopify Bulk Ops may emit:
     * - product nodes
     * - nested nodes
     * - occasional metadata rows
     *
     * We only ingest Product nodes.
     * Example product id:
     *   gid://shopify/Product/1234567890
     */
    if (
      typeof parsed.id !== "string" ||
      !parsed.id.includes("gid://shopify/Product/")
    ) {
      continue;
    }

    batch.push(parsed);

    if (batch.length >= batchSize) {
      await onBatch(batch);
      batch.length = 0; // free memory immediately
    }
  }

  // Flush any remaining rows
  if (batch.length > 0) {
    await onBatch(batch);
    batch.length = 0;
  }
}
