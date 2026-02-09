// FILE: web/lib/sync/productSyncWorker.ts

import { PrismaClient } from "@prisma/client";
import { createAdminApiClient } from "@shopify/admin-api-client";
import readline from "readline";
import { Readable } from "stream";

// ---------------------------------------------------------
// Configuration
// ---------------------------------------------------------

// Lower batch size because we now accumulate product + children in memory.
const SYNC_BATCH_SIZE = 100;
const POLL_INTERVAL_MS = 2000;

// ---------------------------------------------------------
// Bulk Operation Query
// ---------------------------------------------------------

/**
 * IMPORTANT:
 * - Nested connections (variants, collections) DO NOT come back inline in JSONL.
 * - Instead, Bulk Ops flatten them:
 *
 *   {"id": "gid://shopify/Product/1", ...}
 *   {"id": "gid://shopify/ProductVariant/10", "__parentId": "gid://shopify/Product/1", ...}
 *   {"id": "gid://shopify/Collection/50", "__parentId": "gid://shopify/Product/1", ...}
 *
 * The nested edges here only *cause* those child lines to be emitted.
 */
const BULK_PRODUCT_QUERY = `
mutation RunProductBulkOp {
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
            createdAt
            updatedAt
            publishedAt
            tags
            templateSuffix

            descriptionHtml
            seo {
              title
              description
            }

            featuredImage { id }

            variants {
              edges {
                node {
                  id
                  title
                  sku
                  barcode
                  price
                  compareAtPrice
                  inventoryQuantity
                  inventoryPolicy
                  weight
                  weightUnit
                  taxable
                  requiresShipping
                  selectedOptions {
                    name
                    value
                  }
                  inventoryItem {
                    unitCost { amount }
                    countryCodeOfOrigin
                    hsCode
                  }
                }
              }
            }

            collections {
              edges {
                node {
                  id
                  title
                  handle
                }
              }
            }
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

// ---------------------------------------------------------
// Internal Types
// ---------------------------------------------------------

interface ProductAccumulator {
  id: string;          // full GID of product
  rawProduct: any;     // original product line
  variants: any[];     // attached variant lines
  collections: any[];  // attached collection lines
}

export class ProductSyncWorker {
  constructor(private prisma: PrismaClient) {}

  // -------------------------------------------------------
  // Public Entry
  // -------------------------------------------------------

  async runSync(shopId: string, accessToken: string) {
    console.log(`[Sync] FAST sync starting for ${shopId}…`);

    const client = createAdminApiClient({
      storeDomain: shopId,
      apiVersion: "2024-01",
      accessToken,
    });

    // 1) Kick off Bulk Op
    const startResponse = await client.request(BULK_PRODUCT_QUERY);
    const bulk = startResponse.data?.bulkOperationRunQuery?.bulkOperation;
    const userErrors = startResponse.data?.bulkOperationRunQuery?.userErrors;

    if (userErrors && userErrors.length > 0) {
      throw new Error(
        `Bulk operation start failed: ${JSON.stringify(userErrors)}`,
      );
    }

    if (!bulk?.id) {
      throw new Error("Bulk operation did not return an ID.");
    }

    const bulkOpId = bulk.id as string;
    console.log(`[Sync] Bulk Operation ID: ${bulkOpId}`);

    // 2) Poll for URL
    const url = await this.pollForUrl(client, bulkOpId);
    if (!url) {
      console.log(
        `[Sync] Bulk op completed but no URL (possibly empty catalog).`,
      );
      await this.markFastSyncDone(shopId);
      return;
    }

    console.log(`[Sync] JSONL URL ready. Streaming and loading into FAST plane…`);

    // 3) Stream JSONL → Accumulate → Write to DB
    await this.processJsonlStream(url, shopId);

    // 4) Mark fast plane ready
    await this.markFastSyncDone(shopId);

    console.log(`[Sync] FAST sync complete for ${shopId}.`);
  }

  // -------------------------------------------------------
  // Bulk Op Status Poller
  // -------------------------------------------------------

  private async pollForUrl(client: any, opId: string): Promise<string | null> {
    while (true) {
      const resp = await client.request(`
        query BulkOpStatus {
          node(id: "${opId}") {
            ... on BulkOperation {
              id
              status
              errorCode
              url
              objectCount
            }
          }
        }
      `);

      const op = resp.data?.node;
      const status = op?.status;
      if (status === "COMPLETED") {
        return op.url ?? null;
      }

      if (status === "FAILED" || status === "CANCELED") {
        throw new Error(
          `Bulk operation failed: ${op.errorCode ?? "UNKNOWN_ERROR"}`,
        );
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }

  private async markFastSyncDone(shopId: string) {
    await this.prisma.shop.update({
      where: { id: shopId },
      data: {
        fastReady: true,
        fastLastSyncAt: new Date(),
        fastSyncEnqueued: false,
        fastRevision: { increment: 1 },
      },
    });
  }

  // -------------------------------------------------------
  // JSONL Processor – STATE MACHINE
  // -------------------------------------------------------

  /**
   * Critical fix:
   * We treat the JSONL stream as a flat graph and reconstruct
   * parent→children via __parentId. Products become "roots",
   * everything else attaches to the most-recent matching product.
   */
  private async processJsonlStream(url: string, shopId: string) {
    const response = await fetch(url);
    if (!response.body) {
      throw new Error("Bulk op JSONL URL returned empty body.");
    }

    const stream = Readable.fromWeb(response.body as any);
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    let batch: ProductAccumulator[] = [];
    let current: ProductAccumulator | null = null;

    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const row = JSON.parse(trimmed);

      // NOTE: Bulk Ops may or may not provide __typename. We rely on ID pattern + __parentId.
      const parentId: string | undefined = row.__parentId;
      const isProduct = typeof row.id === "string" && /Product\/\d+$/.test(row.id);

      if (isProduct) {
        // Flush previous product (with all attached children)
        if (current) {
          batch.push(current);
        }

        current = {
          id: row.id,
          rawProduct: row,
          variants: [],
          collections: [],
        };

        if (batch.length >= SYNC_BATCH_SIZE) {
          await this.saveBatch(batch, shopId);
          batch = [];
        }
      } else if (parentId && current && parentId === current.id) {
        // Child of the current product
        const idStr = String(row.id);
        if (idStr.includes("ProductVariant")) {
          current.variants.push(row);
        } else if (idStr.includes("Collection")) {
          current.collections.push(row);
        }
        // (If you ever add metafields/inventory items as top-level children,
        //  attach them here as well.)
      } else {
        // Either: out-of-order child, or a node for a product we don't have
        // in "current". In practice Shopify emits parent before children,
        // but if they change behaviour, we can later upgrade to a map
        // keyed by parentId instead of single "current".
      }
    }

    // Flush trailing product
    if (current) {
      batch.push(current);
    }

    if (batch.length > 0) {
      await this.saveBatch(batch, shopId);
    }
  }

  // -------------------------------------------------------
  // DB Writer – with Variant Anti-Drift
  // -------------------------------------------------------

  private async saveBatch(batch: ProductAccumulator[], shopId: string) {
    if (batch.length === 0) return;

    await this.prisma.$transaction(async (tx) => {
      for (const item of batch) {
        try {
          const p = item.rawProduct;
          const variants = item.variants ?? [];
          const collections = item.collections ?? [];

          const productId = this.parseGidTail(p.id);

          // -------------------------------
          // 1. Aggregates for VariantRollup
          // -------------------------------
          const numericPrices = variants
            .map((v) => safeNumber(v.price))
            .filter((n) => Number.isFinite(n)) as number[];

          const totalInventory = variants.reduce(
            (sum: number, v: any) => sum + (v.inventoryQuantity ?? 0),
            0,
          );
          const variantCount = variants.length;

          const minPrice =
            numericPrices.length > 0 ? Math.min(...numericPrices) : null;
          const maxPrice =
            numericPrices.length > 0 ? Math.max(...numericPrices) : null;

          const allTaxable =
            variants.length > 0
              ? variants.every((v: any) => v.taxable === true)
              : false;

          const allTrackQuantity =
            variants.length > 0
              ? variants.every((v: any) =>
                  String(v.inventoryPolicy ?? "").toUpperCase() !== "NOT_TRACKED",
                )
              : false;

          const hasPhysical =
            variants.length > 0
              ? variants.some((v: any) => v.requiresShipping === true)
              : false;

          // -------------------------------
          // 2. ProductLite (FAST plane)
          // -------------------------------
          await tx.productLite.upsert({
            where: { shopId_productId: { shopId, productId } },
            create: {
              shopId,
              productId,
              title: p.title,
              handle: p.handle,
              status: p.status,
              vendor: p.vendor ?? null,
              productType: p.productType ?? null,
              templateSuffix: p.templateSuffix ?? null,
              tags: p.tags ?? [],
              createdAtShopify: new Date(p.createdAt),
              updatedAtShopify: new Date(p.updatedAt),
              publishedAtShopify: p.publishedAt
                ? new Date(p.publishedAt)
                : null,
              hasImages: Boolean(p.featuredImage?.id),
              visibleOnlineStore: true,
              visiblePos: false,
            },
            update: {
              title: p.title,
              handle: p.handle,
              status: p.status,
              vendor: p.vendor ?? null,
              productType: p.productType ?? null,
              templateSuffix: p.templateSuffix ?? null,
              tags: p.tags ?? [],
              updatedAtShopify: new Date(p.updatedAt),
              publishedAtShopify: p.publishedAt
                ? new Date(p.publishedAt)
                : null,
              hasImages: Boolean(p.featuredImage?.id),
            },
          });

          // -------------------------------
          // 3. ProductContent (heavy plane)
          // -------------------------------
          await tx.productContent.upsert({
            where: { shopId_productId: { shopId, productId } },
            create: {
              shopId,
              productId,
              description: p.descriptionHtml ?? null,
              seoTitle: p.seo?.title ?? null,
              seoDescription: p.seo?.description ?? null,
            },
            update: {
              description: p.descriptionHtml ?? null,
              seoTitle: p.seo?.title ?? null,
              seoDescription: p.seo?.description ?? null,
            },
          });

          // -------------------------------
          // 4. VariantRollup (SSOT)
          // -------------------------------
          await tx.variantRollup.upsert({
            where: { shopId_productId: { shopId, productId } },
            create: {
              shopId,
              productId,
              totalInventory,
              variantCount,
              minPrice: minPrice !== null ? minPrice : undefined,
              maxPrice: maxPrice !== null ? maxPrice : undefined,
              allTaxable,
              allTrackQuantity,
              hasPhysical,
            },
            update: {
              totalInventory,
              variantCount,
              minPrice: minPrice !== null ? minPrice : undefined,
              maxPrice: maxPrice !== null ? maxPrice : undefined,
              allTaxable,
              allTrackQuantity,
              hasPhysical,
            },
          });

          // -------------------------------
          // 5. VariantLite (per-variant FAST)
          // -------------------------------
          const activeVariantIds: string[] = [];

          for (const v of variants) {
            const variantId = this.parseGidTail(v.id);
            activeVariantIds.push(variantId);

            const weightGrams = normalizeWeightToGrams(
              v.weight ?? null,
              v.weightUnit ?? null,
            );
            const costAmount =
              v.inventoryItem?.unitCost?.amount != null
                ? safeNumber(v.inventoryItem.unitCost.amount)
                : null;

            await tx.variantLite.upsert({
              where: { shopId_variantId: { shopId, variantId } },
              create: {
                shopId,
                variantId,
                productId,
                title: v.title ?? null,
                sku: v.sku ?? null,
                barcode: v.barcode ?? null,
                price: safeNumber(v.price),
                compareAtPrice:
                  v.compareAtPrice != null
                    ? safeNumber(v.compareAtPrice)
                    : undefined,
                cost: costAmount != null ? costAmount : undefined,
                inventoryQty: v.inventoryQuantity ?? 0,
                inventoryPolicy: v.inventoryPolicy ?? null,
                trackQuantity: v.inventoryPolicy
                  ? String(v.inventoryPolicy).toUpperCase() !== "NOT_TRACKED"
                  : null,
                taxable: v.taxable ?? null,
                weightGrams,
                weightUnit: v.weightUnit ?? null,
                option1Value: v.selectedOptions?.[0]?.value ?? null,
                option2Value: v.selectedOptions?.[1]?.value ?? null,
                option3Value: v.selectedOptions?.[2]?.value ?? null,
                countryOfOrigin:
                  v.inventoryItem?.countryCodeOfOrigin ?? null,
                hsTariffCode: v.inventoryItem?.hsCode ?? null,
              },
              update: {
                title: v.title ?? null,
                sku: v.sku ?? null,
                barcode: v.barcode ?? null,
                price: safeNumber(v.price),
                compareAtPrice:
                  v.compareAtPrice != null
                    ? safeNumber(v.compareAtPrice)
                    : undefined,
                cost: costAmount != null ? costAmount : undefined,
                inventoryQty: v.inventoryQuantity ?? 0,
                inventoryPolicy: v.inventoryPolicy ?? null,
                trackQuantity: v.inventoryPolicy
                  ? String(v.inventoryPolicy).toUpperCase() !== "NOT_TRACKED"
                  : null,
                taxable: v.taxable ?? null,
                weightGrams,
                weightUnit: v.weightUnit ?? null,
                option1Value: v.selectedOptions?.[0]?.value ?? null,
                option2Value: v.selectedOptions?.[1]?.value ?? null,
                option3Value: v.selectedOptions?.[2]?.value ?? null,
                countryOfOrigin:
                  v.inventoryItem?.countryCodeOfOrigin ?? null,
                hsTariffCode: v.inventoryItem?.hsCode ?? null,
              },
            });
          }

          // Anti-drift: remove variants that disappeared in Shopify
          if (activeVariantIds.length > 0) {
            await tx.variantLite.deleteMany({
              where: {
                shopId,
                productId,
                variantId: { notIn: activeVariantIds },
              },
            });
          } else {
            // No variants at all; nuke any stale rows for this product
            await tx.variantLite.deleteMany({
              where: { shopId, productId },
            });
          }

          // -------------------------------
          // 6. ProductCollection (M:N)
          // -------------------------------
          await tx.productCollection.deleteMany({
            where: { shopId, productId },
          });

          if (collections.length > 0) {
            await tx.productCollection.createMany({
              data: collections.map((c: any) => ({
                shopId,
                productId,
                collectionId: this.parseGidTail(c.id),
                collectionTitle: c.title ?? null,
                collectionHandle: c.handle ?? null,
              })),
            });
          }
        } catch (err) {
          console.error(
            `[Sync] Error processing product batch item for shop=${shopId}:`,
            err,
          );
          // You can choose to rethrow to fail the whole transaction,
          // or swallow to keep other products moving. For safety, we opt to fail fast:
          throw err;
        }
      }
    });
  }

  // -------------------------------------------------------
  // Utilities
  // -------------------------------------------------------

  private parseGidTail(gid: string): string {
    // "gid://shopify/Product/8743051493691" → "8743051493691"
    const parts = String(gid).split("/");
    return parts[parts.length - 1] ?? String(gid);
  }
}

// ---------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------

function safeNumber(val: unknown): number {
  if (val == null) return 0;
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

function normalizeWeightToGrams(
  weight: number | null,
  unit: string | null,
): number | null {
  if (weight == null || unit == null) return null;

  switch (unit) {
    case "GRAMS":
      return weight;
    case "KILOGRAMS":
      return weight * 1000;
    case "POUNDS":
      return weight * 453.59237;
    case "OUNCES":
      return weight * 28.3495231;
    default:
      return null;
  }
}
