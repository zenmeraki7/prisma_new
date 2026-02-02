// FILE: web/lib/workers/snapshot.worker.ts

import { Worker, Job } from "bullmq";
import { Prisma } from "@prisma/client";
import prisma from "../../db/prisma"; // Your Prisma singleton (default export)
import { shopifyClient } from "../../lib/shopify/client"; // Your Shopify API wrapper
import { buildSnapshotBulkQuery } from "../shopify/bulk-query-builder";
import { downloadAndStreamJsonl } from "../utils/jsonl-stream"; // Streaming helper
import { FilterKey, FilterOperator } from "../filters/registry";

interface SnapshotJobData {
  action: "INITIATE" | "PROCESS_RESULT";
  shopId: string;
  accessToken: string;

  // For INITIATE
  candidateIds?: string[]; // Shopify product IDs from FAST plane
  filterKeys?: FilterKey[]; // SNAPSHOT filters causing this snapshot

  // For PROCESS_RESULT
  bulkOperationId?: string;
  url?: string; // JSONL download URL from Shopify
}

/**
 * BullMQ worker that:
 *
 *  - INITIATE: kicks off a Shopify Bulk Operation for SNAPSHOT fields,
 *              using only the fields required by the active filter keys.
 *
 *  - PROCESS_RESULT: streams the JSONL result into SnapshotProduct in Supabase.
 *
 * You typically:
 *  - Enqueue INITIATE after you've narrowed candidates via FAST plane.
 *  - Use the `bulk_operations/finish` webhook to enqueue PROCESS_RESULT with url + bulkOperationId.
 */
export const snapshotWorker = new Worker<SnapshotJobData>(
  "snapshot-queue",
  async (job: Job<SnapshotJobData>) => {
    const { action, shopId, accessToken } = job.data;

    console.log(`[SnapshotWorker] Starting job ${job.id}: ${action}`);

    // ================================================================
    // PHASE 1: INITIATE – Trigger Shopify Bulk Operation
    // ================================================================
    if (action === "INITIATE") {
      const { candidateIds, filterKeys } = job.data;
      if (!candidateIds || !candidateIds.length) {
        throw new Error("[SnapshotWorker] INITIATE missing candidateIds");
      }
      if (!filterKeys || !filterKeys.length) {
        throw new Error("[SnapshotWorker] INITIATE missing filterKeys");
      }

      // 1) Build dynamic Bulk Operation GraphQL mutation
      //    Uses registry-based builder to request only the fields we need.
      const mutation = buildSnapshotBulkQuery(filterKeys, candidateIds);

      // 2) Call Shopify
      const client = new shopifyClient(shopId, accessToken);
      const response = await client.request(mutation);

      const runQuery = response.data?.bulkOperationRunQuery;
      if (!runQuery) {
        throw new Error(
          "[SnapshotWorker] bulkOperationRunQuery missing in Shopify response",
        );
      }

      if (runQuery.userErrors && runQuery.userErrors.length > 0) {
        throw new Error(
          `[SnapshotWorker] Shopify Bulk userErrors: ${JSON.stringify(
            runQuery.userErrors,
          )}`,
        );
      }

      const bulkOp = runQuery.bulkOperation;
      if (!bulkOp) {
        throw new Error(
          "[SnapshotWorker] No bulkOperation returned from Shopify",
        );
      }

      console.log(
        `[SnapshotWorker] Triggered Bulk Operation: ${bulkOp.id} (status: ${bulkOp.status})`,
      );

      // We rely on the 'bulk_operations/finish' webhook to enqueue PROCESS_RESULT.
      // Returning the bulkOperationId here is just for observability.
      return { bulkOperationId: bulkOp.id };
    }

    // ================================================================
    // PHASE 2: PROCESS RESULT – Ingest JSONL into SnapshotProduct
    // ================================================================
    if (action === "PROCESS_RESULT") {
      const { url, bulkOperationId } = job.data;

      if (!url) {
        console.log("[SnapshotWorker] PROCESS_RESULT: No URL, nothing to ingest.");
        return;
      }

      console.log(
        `[SnapshotWorker] PROCESS_RESULT: Streaming JSONL from ${url} (bulkOp: ${bulkOperationId})`,
      );

      // If you have a SnapshotRun model, you'd pass a real snapshotRunId instead.
      const snapshotRunId = bulkOperationId || `run_${Date.now()}`;

      // 1) Stream & insert in batches
      await prisma.$transaction(
        async (tx) => {
          const BATCH_SIZE = 1000;
          const buffer: any[] = [];

          await downloadAndStreamJsonl(url, async (rawBatch: any[]) => {
            for (const node of rawBatch) {
              // Each node is a Shopify product node:
              //  { id, handle, descriptionHtml?, seo? { title, description } }

              const productId = node.id as string;
              const descriptionHtml = node.descriptionHtml as string | undefined;
              const seoTitle = node.seo?.title as string | undefined;
              const seoDescription = node.seo?.description as string | undefined;

              buffer.push({
                shopId,
                productId,
                snapshotRunId,
                description: descriptionHtml ?? null,
                seoTitle: seoTitle ?? null,
                seoDescription: seoDescription ?? null,
                // Simple placeholder: you should implement real visibility logic later
                searchEngineVisibility:
                  seoDescription && seoDescription.length > 0
                    ? "visible"
                    : "hidden",
              });

              if (buffer.length >= BATCH_SIZE) {
                await flushSnapshotBatch(tx, buffer.splice(0, buffer.length));
              }
            }

            // After each streamed batch from downloadAndStreamJsonl, flush remainder
            if (buffer.length > 0) {
              await flushSnapshotBatch(tx, buffer.splice(0, buffer.length));
            }
          });
        },
        {
          maxWait: 10_000,
          timeout: 60_000,
        },
      );

      console.log(
        `[SnapshotWorker] PROCESS_RESULT: Ingestion complete for snapshotRunId=${snapshotRunId}`,
      );

      // At this point, SnapshotProduct is populated for this run.
      // You can trigger a follow-up queue to re-run Snapshot-plane filters
      // via a dedicated snapshot planner (planSnapshotProductWhere).
    }
  },
  {
    connection: {
      host: process.env.REDIS_HOST || "localhost",
      port: Number(process.env.REDIS_PORT || 6379),
    },
  },
);

// --- Helper for batch insert into SnapshotProduct ---

async function flushSnapshotBatch(
  tx: Prisma.TransactionClient,
  rows: {
    shopId: string;
    productId: string;
    snapshotRunId: string;
    description: string | null;
    seoTitle: string | null;
    seoDescription: string | null;
    searchEngineVisibility: string; // should match SearchEngineVisibility enum
  }[],
) {
  if (!rows.length) return;

  await tx.snapshotProduct.createMany({
    data: rows,
    skipDuplicates: true, // to avoid duplicate inserts if webhook replays
  });
}
