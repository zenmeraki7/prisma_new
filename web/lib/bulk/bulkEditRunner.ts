// FILE: web/lib/bulk/bulkEditRunner.ts

import type { PrismaClient, Prisma, BulkEditJob } from "@prisma/client";
import { createAdminApiClient } from "@shopify/admin-api-client";
import { FilterPlanner } from "../filters/planner";
import { astFromJson } from "../filters/astFromJson";

// ---------------------------------------------------------
// Configuration
// ---------------------------------------------------------

const TARGET_BATCH_SIZE = 50;          // Shopify mutation batch size
const MAX_BULK_TARGETS = 5_000;        // Guardrail to avoid 100k edits in one job

// ---------------------------------------------------------
// Types
// ---------------------------------------------------------

export type BulkActionType =
  | "ADD_TAGS"
  | "REMOVE_TAGS"
  | "SET_PRICE"
  | "ADJUST_PRICE_PERCENT"
  | "SET_STATUS";

export interface BulkActionPayload {
  type: BulkActionType;
  // shape depends on type:
  // - ADD_TAGS / REMOVE_TAGS: string[]
  // - SET_PRICE: number
  // - ADJUST_PRICE_PERCENT: { deltaPercent: number }
  // - SET_STATUS: "ACTIVE" | "DRAFT" | "ARCHIVED"
  value: any;
}

/**
 * Job.action is expected to be a JSON column with this shape:
 *
 * {
 *   "filter": <FilterExpr JSON>  // The same AST the frontend sends to productsByFilter
 *   "operation": {
 *      "type": "ADD_TAGS",
 *      "value": ["sale", "summer"]
 *   }
 * }
 */
interface BulkEditJobAction {
  filter: unknown;
  operation: BulkActionPayload;
}

export class BulkEditRunner {
  constructor(private prisma: PrismaClient) {}

  /**
   * Main Entry Point: Picks up a QUEUED job and executes it end-to-end.
   */
  async runJob(jobId: string): Promise<void> {
    // 1. Lock job
    const job = await this.prisma.bulkEditJob.findUnique({ where: { id: jobId } });
    if (!job || job.state !== "QUEUED") return;

    await this.prisma.bulkEditJob.update({
      where: { id: jobId },
      data: { state: "RUNNING", startedAt: new Date() },
    });

    const shop = await this.prisma.shop.findUnique({ where: { id: job.shopId } });
    if (!shop?.accessToken || !shop.shopDomain) {
      await this.failJob(jobId, "Shop access token or domain missing");
      return;
    }

    // 2. Init Shopify client
    const client = createAdminApiClient({
      storeDomain: shop.shopDomain,
      apiVersion: "2024-01",
      accessToken: shop.accessToken,
    });

    try {
      // 3. Decode action payload
      const actionPayload = job.action as unknown as BulkEditJobAction;
      if (!actionPayload || !actionPayload.operation) {
        throw new Error("BulkEditJob.action must contain { filter, operation }");
      }

      const { filter, operation } = actionPayload;

      // 4. AST from JSON (SSOT: astFromJson handles operator/key/value validation)
      const filterExpr = astFromJson(filter);

      // 5. Plan via FilterPlanner (SSOT: registry-driven)
      const plan = FilterPlanner.plan(filterExpr, { shopId: job.shopId });

      // Guardrail: do not allow SNAPSHOT-plane filters (for now)
      if (plan.meta.snapshotFiltersCount > 0) {
        throw new Error(
          "Snapshot-plane filters are not supported for bulk edits yet. Please remove description/SEO/metafield filters.",
        );
      }

      const isVariantAction = this.isVariantAction(operation.type);

      // 6. Pre-count targets as a guardrail (FAST plane only)
      const targetCount = await this.estimateTargetCount(job, plan.fastQuery, isVariantAction);
      if (targetCount === 0) {
        await this.completeJob(jobId, 0, 0, "No matching targets for bulk edit");
        return;
      }

      if (targetCount > MAX_BULK_TARGETS) {
        throw new Error(
          `Bulk edit exceeds limit: ${targetCount} targets (max ${MAX_BULK_TARGETS}). Refine your filters.`,
        );
      }

      // 7. Execute job in batches
      await this.processTargets(job, client, plan.fastQuery, operation, isVariantAction, targetCount);

    } catch (e: any) {
      console.error("[BulkEditRunner] Job failed:", e);
      await this.failJob(jobId, e?.message ?? "Unknown error");
    }
  }

  // -------------------------------------------------------
  // Target Estimation / Guardrail
  // -------------------------------------------------------

  private async estimateTargetCount(
    job: BulkEditJob,
    fastWhere: Prisma.ProductLiteWhereInput,
    isVariantAction: boolean,
  ): Promise<number> {
    if (isVariantAction) {
      // Variant-level: count variants that belong to products matching fastWhere
      return this.prisma.variantLite.count({
        where: {
          shopId: job.shopId,
          product: fastWhere, // Relation filter: VariantLite.product -> ProductLiteWhereInput
        },
      });
    }

    // Product-level: count matching products
    return this.prisma.productLite.count({
      where: fastWhere,
    });
  }

  // -------------------------------------------------------
  // Core Batch Processing
  // -------------------------------------------------------

  private async processTargets(
    job: BulkEditJob,
    client: any,
    fastWhere: Prisma.ProductLiteWhereInput,
    operation: BulkActionPayload,
    isVariantAction: boolean,
    totalTargets: number,
  ): Promise<void> {
    let processed = 0;
    let failed = 0;
    let cursor: { id: bigint } | undefined;

    // Note: fastWhere from FilterPlanner already includes shopId in AND root.
    // No need to add shopId again.

    while (true) {
      // 1) Fetch NEXT BATCH of local IDs
      let targets: Array<any> = [];

      if (isVariantAction) {
        targets = await this.prisma.variantLite.findMany({
          where: {
            product: fastWhere,
          },
          take: TARGET_BATCH_SIZE,
          skip: cursor ? 1 : 0,
          cursor,
          orderBy: { id: "asc" },
          select: {
            id: true,
            variantId: true, // Shopify numeric id (string)
            price: true,
            productId: true,
          },
        });
      } else {
        targets = await this.prisma.productLite.findMany({
          where: fastWhere,
          take: TARGET_BATCH_SIZE,
          skip: cursor ? 1 : 0,
          cursor,
          orderBy: { id: "asc" },
          select: {
            id: true,
            productId: true,   // Shopify numeric id (string tail)
            tags: true,
            status: true,
          },
        });
      }

      if (targets.length === 0) break;

      // 2) Build Shopify mutations
      const mutationPromises = targets.map((target) =>
        this.executeShopifyMutation(client, target, operation, isVariantAction),
      );

      const results = await Promise.allSettled(mutationPromises);

      // 3) Local write-through for successful mutations
      const localUpdates: Promise<unknown>[] = [];

      for (let i = 0; i < results.length; i++) {
        const res = results[i];
        const target = targets[i];

        if (res.status === "fulfilled" && res.value.success) {
          localUpdates.push(
            this.applyLocalUpdate(target, operation, isVariantAction, job.shopId),
          );
        } else {
          failed++;
          const errorPayload =
            res.status === "rejected" ? res.reason : res.value.errors;
          console.error(
            `[BulkEditRunner] Shopify mutation failed for local id=${target.id}:`,
            errorPayload,
          );
        }
      }

      await Promise.all(localUpdates);

      // 4) Checkpoint progress on job
      processed += targets.length;
      cursor = { id: targets[targets.length - 1].id as bigint };

      await this.prisma.bulkEditJob.update({
        where: { id: job.id },
        data: {
          processed,
          failed,
          total: totalTargets,
        },
      });
    }

    await this.completeJob(job.id, processed, failed);
  }

  // -------------------------------------------------------
  // Shopify Mutation Execution
  // -------------------------------------------------------

  private async executeShopifyMutation(
    client: any,
    target: any,
    op: BulkActionPayload,
    isVariant: boolean,
  ): Promise<{ success: boolean; errors?: unknown }> {
    const gid = isVariant
      ? `gid://shopify/ProductVariant/${target.variantId}`
      : `gid://shopify/Product/${target.productId}`;

    let query = "";
    let variables: Record<string, unknown> = {};

    switch (op.type) {
      case "ADD_TAGS": {
        query = `
          mutation tagsAdd($id: ID!, $tags: [String!]!) {
            tagsAdd(id: $id, tags: $tags) {
              userErrors { message field }
            }
          }
        `;
        variables = { id: gid, tags: op.value as string[] };
        break;
      }

      case "REMOVE_TAGS": {
        query = `
          mutation tagsRemove($id: ID!, $tags: [String!]!) {
            tagsRemove(id: $id, tags: $tags) {
              userErrors { message field }
            }
          }
        `;
        variables = { id: gid, tags: op.value as string[] };
        break;
      }

      case "SET_STATUS": {
        query = `
          mutation productUpdate($input: ProductInput!) {
            productUpdate(input: $input) {
              userErrors { message field }
            }
          }
        `;
        variables = {
          input: {
            id: gid,
            status: op.value, // "ACTIVE" | "DRAFT" | "ARCHIVED"
          },
        };
        break;
      }

      case "SET_PRICE": {
        query = `
          mutation productVariantUpdate($input: ProductVariantInput!) {
            productVariantUpdate(input: $input) {
              userErrors { message field }
            }
          }
        `;
        variables = {
          input: {
            id: gid,
            price: op.value,
          },
        };
        break;
      }

      case "ADJUST_PRICE_PERCENT": {
        const { deltaPercent } = op.value as { deltaPercent: number };
        const current = Number(target.price ?? 0);
        const updated = current + (current * deltaPercent) / 100;
        query = `
          mutation productVariantUpdate($input: ProductVariantInput!) {
            productVariantUpdate(input: $input) {
              userErrors { message field }
            }
          }
        `;
        variables = {
          input: {
            id: gid,
            price: updated,
          },
        };
        break;
      }

      default:
        throw new Error(`Unsupported bulk action type: ${op.type}`);
    }

    const response = await client.request(query, { variables });
    const userErrors =
      response.data?.tagsAdd?.userErrors ||
      response.data?.tagsRemove?.userErrors ||
      response.data?.productUpdate?.userErrors ||
      response.data?.productVariantUpdate?.userErrors;

    if (userErrors && userErrors.length > 0) {
      return { success: false, errors: userErrors };
    }

    return { success: true };
  }

  // -------------------------------------------------------
  // Local DB Write-Through
  // -------------------------------------------------------

  private async applyLocalUpdate(
    target: any,
    op: BulkActionPayload,
    isVariant: boolean,
    shopId: string,
  ): Promise<void> {
    if (!isVariant) {
      // Product-level
      if (op.type === "ADD_TAGS") {
        const existing: string[] = target.tags || [];
        const toAdd: string[] = op.value || [];
        const newTags = Array.from(new Set([...existing, ...toAdd]));
        await this.prisma.productLite.update({
          where: { id: target.id },
          data: { tags: newTags },
        });
        return;
      }

      if (op.type === "REMOVE_TAGS") {
        const existing: string[] = target.tags || [];
        const toRemove = new Set<string>(op.value || []);
        const newTags = existing.filter((t) => !toRemove.has(t));
        await this.prisma.productLite.update({
          where: { id: target.id },
          data: { tags: newTags },
        });
        return;
      }

      if (op.type === "SET_STATUS") {
        await this.prisma.productLite.update({
          where: { id: target.id },
          data: { status: op.value },
        });
        return;
      }

      // Other product-level ops could be added here.
      return;
    }

    // Variant-level
    if (op.type === "SET_PRICE") {
      await this.prisma.variantLite.update({
        where: { id: target.id },
        data: { price: op.value },
      });
      return;
    }

    if (op.type === "ADJUST_PRICE_PERCENT") {
      const current = Number(target.price ?? 0);
      const { deltaPercent } = op.value as { deltaPercent: number };
      const updated = current + (current * deltaPercent) / 100;
      await this.prisma.variantLite.update({
        where: { id: target.id },
        data: { price: updated },
      });
    }
  }

  // -------------------------------------------------------
  // Job State Helpers
  // -------------------------------------------------------

  private async completeJob(
    id: string,
    processed: number,
    failed: number,
    message?: string,
  ): Promise<void> {
    await this.prisma.bulkEditJob.update({
      where: { id },
      data: {
        state: "SUCCEEDED",
        processed,
        failed,
        completedAt: new Date(),
        completionMessage: message ?? null,
      },
    });
  }

  private async failJob(id: string, errorMessage: string): Promise<void> {
    await this.prisma.bulkEditJob.update({
      where: { id },
      data: {
        state: "FAILED",
        errorMessage,
        completedAt: new Date(),
      },
    });
  }

  // -------------------------------------------------------
  // Helpers
  // -------------------------------------------------------

  private isVariantAction(type: BulkActionType): boolean {
    return type === "SET_PRICE" || type === "ADJUST_PRICE_PERCENT";
  }
}
