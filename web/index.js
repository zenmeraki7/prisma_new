// FILE: web/index.js
import "dotenv/config"; // MUST be first
import { join } from "path";
import { readFileSync } from "fs";
import express from "express";
import serveStatic from "serve-static";

import shopify from "./shopify.js";
import productCreator from "./product-creator.js";
import PrivacyWebhookHandlers from "./privacy.js";
import { prisma } from "./db/prisma.js";

const PORT = parseInt(
  process.env.BACKEND_PORT || process.env.PORT || "3000",
  10,
);

const STATIC_PATH =
  process.env.NODE_ENV === "production"
    ? `${process.cwd()}/frontend/dist`
    : `${process.cwd()}/frontend/`;

// ──────────────────────────────────────────────
// Helper: safely serialize Prisma models (BigInt → string)
// ──────────────────────────────────────────────
function serializePrisma(value) {
  if (value === null || value === undefined) return value;

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map((v) => serializePrisma(v));
  }

  if (value instanceof Date) {
    // Let Express / JSON.stringify handle Date normally
    return value;
  }

  if (typeof value === "object") {
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = serializePrisma(val);
    }
    return out;
  }

  return value;
}

// ──────────────────────────────────────────────
// Runtime DB test
// ──────────────────────────────────────────────
async function testDbConnection() {
  try {
    await prisma.$connect();
    console.log("✅ Database connected via Prisma");
  } catch (error) {
    console.error("❌ Database connection failed:", error);
  }
}

// ──────────────────────────────────────────────
// Filter helpers
// ──────────────────────────────────────────────

function parseBooleanInput(value) {
  if (typeof value === "boolean") return value;
  if (value == null) return false;
  const s = String(value).trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "y";
}

function parseNumberInput(value) {
  if (typeof value === "number") return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseDateInput(value) {
  if (value instanceof Date) return value;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Map your legacy filter DSL (same shape used by productsByFilter in this file)
 * to a Prisma ProductLiteWhereInput.
 *
 * Supports product + variant + rollup filters.
 *
 * @param {string} shopId
 * @param {any} filterExpr
 * @returns {import('@prisma/client').Prisma.ProductLiteWhereInput}
 */
function buildProductWhereFromFilter(shopId, filterExpr) {
  /** @type {import('@prisma/client').Prisma.ProductLiteWhereInput} */
  const where = { shopId };

  if (
    !filterExpr ||
    filterExpr.type !== "group" ||
    !Array.isArray(filterExpr.children)
  ) {
    return where;
  }

  for (const child of filterExpr.children) {
    if (!child || child.type !== "leaf") continue;

    const { filterId, op, value } = child;

    // ───────────────── PRODUCT FIELDS ─────────────────

    if (filterId === "product.category" && op === "contains") {
      where.category = {
        contains: String(value),
        mode: "insensitive",
      };
    } else if (filterId === "product.collection" && op === "contains") {
      // Match either collection title or handle
      where.collections = {
        some: {
          OR: [
            {
              collectionTitle: {
                contains: String(value),
                mode: "insensitive",
              },
            },
            {
              collectionHandle: {
                contains: String(value),
                mode: "insensitive",
              },
            },
          ],
        },
      };
    } else if (filterId === "product.createdAt" && op === "gte") {
      const d = parseDateInput(value);
      if (d) {
        where.createdAtShopify = { gte: d };
      }
    } else if (filterId === "product.publishedAt" && op === "gte") {
      const d = parseDateInput(value);
      if (d) {
        where.publishedAtShopify = { gte: d };
      }
    } else if (filterId === "product.updatedAt" && op === "gte") {
      const d = parseDateInput(value);
      if (d) {
        where.updatedAtShopify = { gte: d };
      }
    } else if (filterId === "product.description" && op === "contains") {
      // NOTE: Only valid if ProductLite has a description column
      where.description = {
        contains: String(value),
        mode: "insensitive",
      };
    } else if (filterId === "product.handle" && op === "contains") {
      where.handle = {
        contains: String(value),
        mode: "insensitive",
      };
    } else if (filterId === "product.inventoryQuantity" && op === "gte") {
      const n = parseNumberInput(value);
      if (n != null) {
        // Use rollup relation if present
        where.variantRollup = {
          is: {
            totalInventory: { gte: n },
          },
        };
      }
    } else if (filterId === "product.option1Name" && op === "contains") {
      where.option1Name = {
        contains: String(value),
        mode: "insensitive",
      };
    } else if (filterId === "product.option2Name" && op === "contains") {
      where.option2Name = {
        contains: String(value),
        mode: "insensitive",
      };
    } else if (filterId === "product.option3Name" && op === "contains") {
      where.option3Name = {
        contains: String(value),
        mode: "insensitive",
      };
    } else if (filterId === "product.productId" && op === "contains") {
      // Shopify GID
      where.productId = {
        contains: String(value),
        mode: "insensitive",
      };
    } else if (filterId === "product.productType" && op === "contains") {
      where.productType = {
        contains: String(value),
        mode: "insensitive",
      };
    } else if (filterId === "product.isSearchable" && op === "eq") {
      where.isSearchable = parseBooleanInput(value);
    } else if (filterId === "product.status" && op === "contains") {
      // allow contains for UX, but case-insensitive
      where.status = {
        contains: String(value).toUpperCase(),
        mode: "insensitive",
      };
    } else if (filterId === "product.tag" && op === "contains") {
      // ProductLite.tags is a TEXT[]; simple "has" check for exact tag match.
      // (If you later want partial / case-insensitive, move back to a normalized join.)
      where.tags = {
        has: String(value),
      };
    } else if (filterId === "product.templateSuffix" && op === "contains") {
      where.templateSuffix = {
        contains: String(value),
        mode: "insensitive",
      };
    } else if (filterId === "product.title" && op === "contains") {
      where.title = {
        contains: String(value),
        mode: "insensitive",
      };
    } else if (filterId === "product.variantCount" && op === "gte") {
      const n = parseNumberInput(value);
      if (n != null) {
        where.variantCount = { gte: n };
      }
    } else if (filterId === "product.vendor" && op === "contains") {
      where.vendor = {
        contains: String(value),
        mode: "insensitive",
      };
    } else if (filterId === "product.visibleOnlineStore" && op === "eq") {
      where.visibleOnlineStore = parseBooleanInput(value);
    } else if (filterId === "product.visiblePos" && op === "eq") {
      where.visiblePos = parseBooleanInput(value);
    }

    // ───────────────── VARIANT / ROLLUP FIELDS ─────────────────
    else if (filterId === "variant.barcode" && op === "contains") {
      where.variants = {
        some: {
          barcode: { contains: String(value), mode: "insensitive" },
        },
      };
    } else if (filterId === "variant.taxable" && op === "eq") {
      where.variants = {
        some: {
          taxable: parseBooleanInput(value),
        },
      };
    } else if (filterId === "variant.compareAtPrice" && op === "gte") {
      const n = parseNumberInput(value);
      if (n != null) {
        where.variants = {
          some: {
            compareAtPrice: { gte: n },
          },
        };
      }
    } else if (filterId === "variant.inventoryLocation" && op === "contains") {
      where.inventoryByLoc = {
        some: {
          locationId: {
            contains: String(value),
            mode: "insensitive",
          },
          hasInventory: true,
        },
      };
    } else if (filterId === "variant.cost" && op === "gte") {
      const n = parseNumberInput(value);
      if (n != null) {
        where.variants = {
          some: {
            cost: { gte: n },
          },
        };
      }
    } else if (filterId === "variant.countryOfOrigin" && op === "contains") {
      where.variants = {
        some: {
          countryOfOrigin: {
            contains: String(value),
            mode: "insensitive",
          },
        },
      };
    } else if (filterId === "variant.hsTariffCode" && op === "contains") {
      where.variants = {
        some: {
          hsTariffCode: {
            contains: String(value),
            mode: "insensitive",
          },
        },
      };
    } else if (filterId === "variant.inventoryPolicy" && op === "contains") {
      where.variants = {
        some: {
          inventoryPolicy: {
            contains: String(value),
            mode: "insensitive",
          },
        },
      };
    } else if (filterId === "variant.option1Value" && op === "contains") {
      where.variants = {
        some: {
          option1Value: {
            contains: String(value),
            mode: "insensitive",
          },
        },
      };
    } else if (filterId === "variant.option2Value" && op === "contains") {
      where.variants = {
        some: {
          option2Value: {
            contains: String(value),
            mode: "insensitive",
          },
        },
      };
    } else if (filterId === "variant.option3Value" && op === "contains") {
      where.variants = {
        some: {
          option3Value: {
            contains: String(value),
            mode: "insensitive",
          },
        },
      };
    } else if (filterId === "variant.physical" && op === "eq") {
      // backed by VariantRollup.hasPhysical
      where.variantRollup = {
        is: {
          hasPhysical: parseBooleanInput(value),
        },
      };
    } else if (filterId === "variant.price" && op === "gte") {
      const n = parseNumberInput(value);
      if (n != null) {
        // any variant with price ≥ n (rollup)
        where.variantRollup = {
          is: {
            maxPrice: { gte: n },
          },
        };
      }
    } else if (filterId === "variant.profitMargin" && op === "gte") {
      const n = parseNumberInput(value);
      if (n != null) {
        // use maxMargin from VariantRollup (percentage)
        where.variantRollup = {
          is: {
            maxMargin: { gte: n },
          },
        };
      }
    } else if (filterId === "variant.sku" && op === "contains") {
      where.variants = {
        some: {
          sku: { contains: String(value), mode: "insensitive" },
        },
      };
    } else if (filterId === "variant.trackQuantity" && op === "eq") {
      where.variants = {
        some: {
          trackQuantity: parseBooleanInput(value),
        },
      };
    } else if (filterId === "variant.inventoryQty" && op === "gte") {
      const n = parseNumberInput(value);
      if (n != null) {
        where.variants = {
          some: {
            inventoryQty: { gte: n },
          },
        };
      }
    } else if (filterId === "variant.title" && op === "contains") {
      where.variants = {
        some: {
          title: { contains: String(value), mode: "insensitive" },
        },
      };
    } else if (filterId === "variant.weightGrams" && op === "gte") {
      const n = parseNumberInput(value);
      if (n != null) {
        where.variants = {
          some: {
            weightGrams: { gte: n },
          },
        };
      }
    } else if (filterId === "variant.weightUnit" && op === "contains") {
      where.variants = {
        some: {
          weightUnit: {
            contains: String(value),
            mode: "insensitive",
          },
        },
      };
    }
  }

  return where;
}

/**
 * Real snapshot builder for the new SnapshotRun / SnapshotProduct schema.
 * - Creates a SnapshotRun row
 * - Selects product IDs from FAST plane based on filter
 * - Inserts SnapshotProduct rows in batches (compressed JSON)
 */
async function buildSnapshotForPlanHash({ shop, planHash, filterExpr }) {
  // TTL for snapshot (e.g. 7 days)
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  // 1) Create run row in RUNNING
  const run = await prisma.snapshotRun.create({
    data: {
      shopId: shop.id,
      planHash,
      state: "RUNNING",
      productCount: 0,
      approxBytes: BigInt(0),
      reuseCount: 0,
      expiresAt,
    },
  });

  const runId = run.id;

  try {
    const where = buildProductWhereFromFilter(shop.id, filterExpr);

    // 2) Count total matching products
    const total = await prisma.productLite.count({ where });

    // 3) Walk products in batches and insert snapshot rows
    const pageSize = 500;
    let processed = 0;
    let approxBytes = BigInt(0);
    let offset = 0;

    while (true) {
      const batch = await prisma.productLite.findMany({
        where,
        orderBy: { updatedAtShopify: "desc" },
        skip: offset,
        take: pageSize,
        select: {
          productId: true, // use Shopify GID as membership key
        },
      });

      if (!batch.length) break;

      const data = batch.map((p) => {
        const payload = { productId: p.productId };
        const buf = Buffer.from(JSON.stringify(payload), "utf-8");
        approxBytes += BigInt(buf.byteLength);

        return {
          id: `${runId}:${p.productId}`,
          shopId: shop.id,
          snapshotRunId: runId,
          productId: p.productId,
          dataCompressed: buf,
          compression: "json",
        };
      });

      await prisma.snapshotProduct.createMany({
        data,
        skipDuplicates: true,
      });

      processed += batch.length;
      offset += batch.length;
    }

    // 4) Mark run as succeeded
    await prisma.snapshotRun.update({
      where: { id: runId },
      data: {
        state: "SUCCEEDED",
        productCount: processed,
        approxBytes,
        completedAt: new Date(),
      },
    });

    return await prisma.snapshotRun.findUnique({ where: { id: runId } });
  } catch (err) {
    console.error("❌ Snapshot run failed:", err);

    await prisma.snapshotRun.update({
      where: { id: runId },
      data: {
        state: "FAILED",
        completedAt: new Date(),
      },
    });

    throw err;
  }
}

// ──────────────────────────────────────────────
// Express app
// ──────────────────────────────────────────────
const app = express();
app.use(express.json());

// ──────────────────────────────────────────────
// Shopify authentication + webhooks
// ──────────────────────────────────────────────
app.get(shopify.config.auth.path, shopify.auth.begin());
app.get(
  shopify.config.auth.callbackPath,
  shopify.auth.callback(),
  shopify.redirectToShopifyOrAppRoot(),
);
app.post(
  shopify.config.webhooks.path,
  shopify.processWebhooks({ webhookHandlers: PrivacyWebhookHandlers }),
);

// ──────────────────────────────────────────────
// API auth middleware
// ──────────────────────────────────────────────
app.use("/api/*", shopify.validateAuthenticatedSession());

// ──────────────────────────────────────────────
// GRAPHQL API (string-dispatch style)
// ──────────────────────────────────────────────
app.post("/api/graphql", async (req, res) => {
  try {
    const session = res.locals.shopify?.session;
    if (!session) {
      return res.status(401).json({ errors: [{ message: "Unauthenticated" }] });
    }

    const { query, variables } = req.body || {};
    if (!query || typeof query !== "string") {
      return res
        .status(400)
        .json({ errors: [{ message: "Missing GraphQL query" }] });
    }

    const client = new shopify.api.clients.Graphql({ session });
    const shopDomain = session.shop; // use shop domain as natural key

    // ───────────────── planFilter ─────────────────
    if (query.includes("planFilter")) {
      const filter = variables?.filter ?? variables?.input?.filter ?? null;

      const executionMode = "FAST_ONLY"; // currently no SNAPSHOT planner wiring
      const planHash = filter
        ? Buffer.from(JSON.stringify(filter)).toString("base64").slice(0, 16)
        : "default";

      const filterSummary = filter
        ? JSON.stringify(filter).slice(0, 120)
        : "No filter";

      return res.json({
        data: {
          planFilter: {
            executionMode,
            planHash,
            filterSummary,
          },
        },
      });
    }

    // ───────────────── bootstrapProducts ─────────────────
    if (query.includes("bootstrapProducts")) {
      const first = Number(variables?.first ?? 25);
      const after = variables?.after ?? null;

      const shopifyQuery = `
        query BootstrapProducts($first: Int!, $after: String) {
          products(first: $first, after: $after) {
            edges {
              cursor
              node {
                id
                title
                handle
                status
                vendor
                productType
                tags
                updatedAt
                images(first: 1) {
                  edges {
                    node { id }
                  }
                }
              }
            }
            pageInfo {
              hasNextPage
            }
          }
        }
      `;

      const response = await client.request(shopifyQuery, {
        variables: { first, after },
      });
      const edges = response?.data?.products?.edges || [];
      const items = edges.map((edge) => {
        const p = edge.node;
        return {
          id: p.id,
          title: p.title,
          handle: p.handle,
          status: p.status,
          vendor: p.vendor,
          productType: p.productType,
          tags: p.tags || [],
          hasImages: (p.images?.edges?.length || 0) > 0,
          updatedAtShopify: p.updatedAt,
        };
      });
      const nextCursor =
        edges.length > 0 ? edges[edges.length - 1].cursor : null;

      return res.json({
        data: {
          bootstrapProducts: {
            status: {
              fastReady: true,
              syncEnqueued: false,
              fastLastSyncAt: new Date().toISOString(),
              fastRevision: 1,
            },
            page: { items, nextCursor },
          },
        },
      });
    }

    // ───────────────── syncProductsToDb ─────────────────
    if (query.includes("syncProductsToDb")) {
      try {
        const first = Number(variables?.first ?? 50);
        const after = variables?.after ?? null;

        console.log(
          `🔄 syncProductsToDb: first=${first}, after=${after}, shopDomain=${shopDomain}`,
        );

        // 1) Ensure Shop record exists.
        //    Use shopDomain as canonical shopId (matches Shop.id).
        const shop = await prisma.shop.upsert({
          where: { shopDomain },
          update: {
            accessToken: session.accessToken,
            updatedAt: new Date(),
          },
          create: {
            id: shopDomain,
            shopDomain,
            accessToken: session.accessToken,
          },
        });

        console.log(`🔑 Using shop.id=${shop.id} for foreign key`);

        // 2) Pull products from Shopify (include createdAt / publishedAt / variants)
        const shopifyQuery = `
          query SyncProducts($first: Int!, $after: String) {
            products(first: $first, after: $after) {
              edges {
                cursor
                node {
                  id
                  title
                  handle
                  status
                  vendor
                  productType
                  tags
                  createdAt
                  publishedAt
                  updatedAt
                  images(first: 1) {
                    edges {
                      node { id }
                    }
                  }
                  variants(first: 250) {
                    edges {
                      node {
                        inventoryQuantity
                        price
                        compareAtPrice
                      }
                    }
                  }
                }
              }
              pageInfo {
                hasNextPage
              }
            }
          }
        `;

        const response = await client.request(shopifyQuery, {
          variables: { first, after },
        });

        const edges = response?.data?.products?.edges || [];
        console.log(`📦 Fetched ${edges.length} products from Shopify`);

        // 3) Save to FAST plane tables
        for (const edge of edges) {
          const p = edge.node;

          try {
            const variants = p.variants?.edges?.map((e) => e.node) ?? [];

            const totalInventory = variants.reduce((sum, v) => {
              const qty =
                typeof v.inventoryQuantity === "number"
                  ? v.inventoryQuantity
                  : 0;
              return sum + qty;
            }, 0);

            // Price stats for rollup + ProductLite
            const priceNumbers = variants
              .map((v) => {
                if (v.price == null) return null;
                const n =
                  typeof v.price === "string" ? Number(v.price) : v.price;
                return Number.isFinite(n) ? n : null;
              })
              .filter((n) => n != null);

            const hasPrice = priceNumbers.length > 0;
            const minPriceRaw = hasPrice ? Math.min(...priceNumbers) : null;
            const maxPriceRaw = hasPrice ? Math.max(...priceNumbers) : null;

            // For VariantRollup (non-nullable Decimal fields),
            // fall back to 0 if we don't have any prices.
            const minPriceRollup = hasPrice ? minPriceRaw : 0;
            const maxPriceRollup = hasPrice ? maxPriceRaw : 0;

            // ---- ProductLite ----
            await prisma.productLite.upsert({
              where: {
                // from @@unique([shopId, productId])
                shopId_productId: {
                  shopId: shop.id,
                  productId: p.id, // Shopify GID
                },
              },
              update: {
                title: p.title,
                handle: p.handle,
                status: p.status,
                vendor: p.vendor || null,
                productType: p.productType || null,
                tags: p.tags || [],
                hasImages: (p.images?.edges?.length || 0) > 0,
                createdAtShopify: p.createdAt
                  ? new Date(p.createdAt)
                  : new Date(),
                updatedAtShopify: p.updatedAt
                  ? new Date(p.updatedAt)
                  : new Date(),
                publishedAtShopify: p.publishedAt
                  ? new Date(p.publishedAt)
                  : null,
                totalInventory,
                variantCount: variants.length || null,
                minPrice: hasPrice ? minPriceRaw : null,
                maxPrice: hasPrice ? maxPriceRaw : null,
              },
              create: {
                shopId: shop.id,
                productId: p.id,
                title: p.title,
                handle: p.handle,
                status: p.status,
                vendor: p.vendor || null,
                productType: p.productType || null,
                tags: p.tags || [],
                hasImages: (p.images?.edges?.length || 0) > 0,
                createdAtShopify: p.createdAt
                  ? new Date(p.createdAt)
                  : new Date(),
                updatedAtShopify: p.updatedAt
                  ? new Date(p.updatedAt)
                  : new Date(),
                publishedAtShopify: p.publishedAt
                  ? new Date(p.publishedAt)
                  : null,
                totalInventory,
                variantCount: variants.length || null,
                minPrice: hasPrice ? minPriceRaw : null,
                maxPrice: hasPrice ? maxPriceRaw : null,
              },
            });

            // ---- VariantRollup ----
            await prisma.variantRollup.upsert({
              where: {
                shopId_productId: {
                  shopId: shop.id,
                  productId: p.id,
                },
              },
              update: {
                totalInventory,
                variantCount: variants.length || null,
                minPrice: minPriceRollup,
                maxPrice: maxPriceRollup,
              },
              create: {
                shopId: shop.id,
                productId: p.id,
                totalInventory,
                variantCount: variants.length || null,
                minPrice: minPriceRollup,
                maxPrice: maxPriceRollup,
              },
            });

            // ---- tags (normalized) ----
            if (p.tags && p.tags.length > 0) {
              await prisma.productTag.deleteMany({
                where: { shopId: shop.id, productId: p.id },
              });

              await prisma.productTag.createMany({
                data: p.tags.map((tag) => ({
                  shopId: shop.id,
                  productId: p.id,
                  tag,
                })),
                skipDuplicates: true,
              });
            } else {
              await prisma.productTag.deleteMany({
                where: { shopId: shop.id, productId: p.id },
              });
            }
          } catch (productError) {
            console.error(`❌ Error syncing product ${p.id}:`, productError);
            throw productError;
          }
        }

        console.log(
          `✅ Successfully synced ${edges.length} products to database`,
        );

        const hasNextPage =
          response?.data?.products?.pageInfo?.hasNextPage || false;
        const nextCursor =
          hasNextPage && edges.length > 0
            ? edges[edges.length - 1].cursor
            : null;

        return res.json({
          data: {
            syncProductsToDb: {
              synced: edges.length,
              nextCursor,
              hasNextPage,
            },
          },
        });
      } catch (syncError) {
        console.error("❌ syncProductsToDb error:", syncError);
        return res.status(500).json({
          errors: [
            {
              message: "Sync failed",
              details: syncError.message,
              stack:
                process.env.NODE_ENV === "development"
                  ? syncError.stack
                  : undefined,
            },
          ],
        });
      }
    }

    // ───────────────── productsByFilter (FAST plane) ─────────────────
    if (query.includes("productsByFilter")) {
      try {
        const input = variables?.input || {};
        const first = Number(input.first ?? 50);
        const after = input.after ?? null;
        const filterExpr = input.filter || null;

        console.log(`🔍 productsByFilter called:`, {
          first,
          after,
          filterExpr: JSON.stringify(filterExpr, null, 2),
        });

        const shop = await prisma.shop.findUnique({
          where: { shopDomain },
        });

        if (!shop) {
          console.log(`❌ Shop not found for domain: ${shopDomain}`);
          return res.json({
            data: {
              productsByFilter: {
                items: [],
                nextCursor: null,
                mode: "FAST_ONLY",
                guardrail: {
                  candidateCount: 0,
                  candidateLimit: 50000,
                  candidateLimitHit: false,
                },
                warnings: [],
              },
            },
          });
        }

        const where = buildProductWhereFromFilter(shop.id, filterExpr);

        console.log(`🔎 Prisma where clause:`, JSON.stringify(where, null, 2));

        const offset = after ? parseInt(after, 10) : 0;

        const items = await prisma.productLite.findMany({
          where,
          orderBy: { updatedAtShopify: "desc" },
          take: first,
          skip: offset,
          // NOTE: no include here; tags are stored directly on ProductLite.tags[]
        });

        console.log(`📦 Found ${items.length} products matching filters`);

        const transformedItems = items.map((item) => ({
          id: item.productId,
          title: item.title,
          handle: item.handle,
          status: item.status,
          vendor: item.vendor,
          productType: item.productType,
          tags: item.tags || [],
          hasImages: item.hasImages,
          updatedAtShopify: item.updatedAtShopify,
          totalInventory: item.totalInventory ?? null,
          variantCount: item.variantCount ?? null,
        }));

        const nextCursor =
          items.length === first ? String(offset + items.length) : null;

        // Simple guardrail stub so frontend has shape
        const guardrail = {
          candidateCount: transformedItems.length,
          candidateLimit: 50000,
          candidateLimitHit: false,
        };

        return res.json({
          data: {
            productsByFilter: {
              items: transformedItems,
              nextCursor,
              mode: "FAST_ONLY",
              guardrail,
              warnings: [],
            },
          },
        });
      } catch (filterError) {
        console.error("❌ productsByFilter error:", filterError);
        return res.status(500).json({
          errors: [
            {
              message: "Filter query failed",
              details: filterError.message,
            },
          ],
        });
      }
    }

    // ───────────────── triggerSnapshotRun ─────────────────
    if (query.includes("triggerSnapshotRun")) {
      const planHash = variables?.planHash;
      const filterExpr = variables?.filterJson ?? null;

      if (!planHash || typeof planHash !== "string") {
        return res
          .status(400)
          .json({ errors: [{ message: "planHash is required" }] });
      }

      const shop = await prisma.shop.findUnique({
        where: { shopDomain },
      });

      if (!shop) {
        return res.status(400).json({
          errors: [{ message: `No Shop row found for ${shopDomain}` }],
        });
      }

      const run = await buildSnapshotForPlanHash({
        shop,
        planHash,
        filterExpr,
      });

      return res.json({
        data: {
          triggerSnapshotRun: serializePrisma(run),
        },
      });
    }

    // ───────────────── snapshotStatus ─────────────────
    if (query.includes("snapshotStatus")) {
      const planHash = variables?.planHash;
      if (!planHash || typeof planHash !== "string") {
        return res
          .status(400)
          .json({ errors: [{ message: "planHash is required" }] });
      }

      const shop = await prisma.shop.findUnique({
        where: { shopDomain },
      });

      if (!shop) {
        return res.json({
          data: {
            snapshotStatus: {
              state: "PENDING",
              progress: 0,
              total: 0,
              errorMessage: null,
              filterSummary: null,
              planHash,
              snapshotRunId: null,
            },
          },
        });
      }

      const latestRun = await prisma.snapshotRun.findFirst({
        where: { shopId: shop.id, planHash },
        orderBy: { createdAt: "desc" },
      });

      if (!latestRun) {
        return res.json({
          data: {
            snapshotStatus: {
              state: "PENDING",
              progress: 0,
              total: 0,
              errorMessage: null,
              filterSummary: null,
              planHash,
              snapshotRunId: null,
            },
          },
        });
      }

      return res.json({
        data: {
          snapshotStatus: {
            state: latestRun.state,
            progress: latestRun.productCount, // we only know final count
            total: latestRun.productCount,
            errorMessage: null,
            filterSummary: null,
            planHash: latestRun.planHash,
            snapshotRunId: String(latestRun.id),
          },
        },
      });
    }

    // ───────────────── productsBySnapshot ─────────────────
    if (query.includes("productsBySnapshot")) {
      const planHash = variables?.planHash;
      const first = Number(variables?.first ?? 50);
      const after = variables?.after ?? null;

      if (!planHash || typeof planHash !== "string") {
        return res
          .status(400)
          .json({ errors: [{ message: "planHash is required" }] });
      }

      const shop = await prisma.shop.findUnique({
        where: { shopDomain },
      });

      if (!shop) {
        return res.json({
          data: {
            productsBySnapshot: {
              items: [],
              nextCursor: null,
              snapshotRunId: null,
            },
          },
        });
      }

      const latestRun = await prisma.snapshotRun.findFirst({
        where: { shopId: shop.id, planHash },
        orderBy: { createdAt: "desc" },
      });

      if (!latestRun) {
        return res.json({
          data: {
            productsBySnapshot: {
              items: [],
              nextCursor: null,
              snapshotRunId: null,
            },
          },
        });
      }

      const offset = after ? parseInt(after, 10) : 0;

      const memberships = await prisma.snapshotProduct.findMany({
        where: {
          shopId: shop.id,
          snapshotRunId: latestRun.id,
        },
        orderBy: { id: "asc" },
        skip: offset,
        take: first,
        select: {
          productId: true,
        },
      });

      if (!memberships.length) {
        return res.json({
          data: {
            productsBySnapshot: {
              items: [],
              nextCursor: null,
              snapshotRunId: String(latestRun.id),
            },
          },
        });
      }

      const productIds = memberships.map((m) => m.productId);

      const products = await prisma.productLite.findMany({
        where: {
          shopId: shop.id,
          productId: { in: productIds }, // Shopify GIDs
        },
        // tags now live directly on ProductLite.tags[]
      });

      const items = products.map((item) => ({
        id: item.productId, // Shopify GID outward
        title: item.title,
        handle: item.handle,
        status: item.status,
        vendor: item.vendor,
        productType: item.productType,
        tags: item.tags || [],
        hasImages: item.hasImages,
        updatedAtShopify: item.updatedAtShopify,
      }));

      const nextCursor =
        memberships.length === first
          ? String(offset + memberships.length)
          : null;

      return res.json({
        data: {
          productsBySnapshot: {
            items,
            nextCursor,
            snapshotRunId: String(latestRun.id),
          },
        },
      });
    }

    // ───────────────── snapshotRuns (connection style) ─────────────────
    if (query.includes("snapshotRuns")) {
      const first = Number(variables?.first ?? 25);
      const after = variables?.after ?? null;

      const shop = await prisma.shop.findUnique({
        where: { shopDomain },
      });

      if (!shop) {
        console.log("⚠️ No Shop row for domain", shopDomain);
        return res.json({
          data: {
            snapshotRuns: {
              edges: [],
              pageInfo: {
                hasNextPage: false,
                endCursor: null,
              },
            },
          },
        });
      }

      const offset = after ? parseInt(after, 10) : 0;

      const runs = await prisma.snapshotRun.findMany({
        where: { shopId: shop.id },
        orderBy: { createdAt: "desc" },
        take: first,
        skip: offset,
      });

      const safeRuns = runs.map((run) => serializePrisma(run));

      const edges = safeRuns.map((run, idx) => ({
        cursor: String(offset + idx + 1),
        node: run,
      }));

      const hasNextPage = runs.length === first;
      const endCursor = hasNextPage ? String(offset + runs.length) : null;

      return res.json({
        data: {
          snapshotRuns: {
            edges,
            pageInfo: {
              hasNextPage,
              endCursor,
            },
          },
        },
      });
    }

    // ───────────────── unknown operation ─────────────────
    return res
      .status(400)
      .json({ errors: [{ message: "Unsupported GraphQL operation" }] });
  } catch (error) {
    console.error("❌ /api/graphql error:", error);
    return res.status(500).json({
      errors: [{ message: "GraphQL server error", details: error.message }],
    });
  }
});

// ──────────────────────────────────────────────
// REST endpoints (from template)
// ──────────────────────────────────────────────
app.get("/api/products/count", async (_req, res) => {
  try {
    const client = new shopify.api.clients.Graphql({
      session: res.locals.shopify.session,
    });
    const result = await client.request(`query { productsCount { count } }`);
    res.status(200).send({ count: result.data.productsCount.count });
  } catch (err) {
    console.error("❌ Count error:", err);
    res.status(500).send({ error: "Failed to fetch product count" });
  }
});

app.post("/api/products", async (_req, res) => {
  let status = 200;
  let error = null;
  try {
    await productCreator(res.locals.shopify.session);
  } catch (e) {
    console.error("❌ Product create failed:", e.message);
    status = 500;
    error = e.message;
  }
  res.status(status).send({ success: status === 200, error });
});

// ──────────────────────────────────────────────
// CSP + Static frontend
// ──────────────────────────────────────────────
app.use(shopify.cspHeaders());
app.use(serveStatic(STATIC_PATH, { index: false }));

// Catch-all
app.use("/*", shopify.ensureInstalledOnShop(), async (_req, res) => {
  return res
    .status(200)
    .set("Content-Type", "text/html")
    .send(
      readFileSync(join(STATIC_PATH, "index.html"))
        .toString()
        .replace("%VITE_SHOPIFY_API_KEY%", process.env.SHOPIFY_API_KEY || ""),
    );
});

// ──────────────────────────────────────────────
// Start server
// ──────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  testDbConnection();
});
