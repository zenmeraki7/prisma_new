// web/index.js
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
    // Let Express / JSON.stringify handle Date normally by returning it
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
// Express app
// ──────────────────────────────────────────────
const app = express();
app.use(express.json());

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
// Shared helpers
// ──────────────────────────────────────────────

/**
 * Map your filter DSL (same shape used by productsByFilter) to a ProductLite where.
 * This guarantees FAST plane and SNAPSHOT plane see exactly the same product set.
 *
 * @param {string} shopId
 * @param {any} filterExpr
 * @returns {import('@prisma/client').Prisma.ProductLiteWhereInput}
 */
function buildProductWhereFromFilter(shopId, filterExpr) {
  /** @type {import('@prisma/client').Prisma.ProductLiteWhereInput} */
  const where = { shopId };

  if (filterExpr && filterExpr.type === "group" && Array.isArray(filterExpr.children)) {
    for (const child of filterExpr.children) {
      if (child.type !== "leaf") continue;

      const { filterId, op, value } = child;

      if (filterId === "product.status" && op === "eq") {
        where.status = String(value).toUpperCase();
      } else if (filterId === "product.vendor" && op === "contains") {
        where.vendor = {
          contains: String(value),
          mode: "insensitive",
        };
      } else if (filterId === "product.productType" && op === "contains") {
        where.productType = {
          contains: String(value),
          mode: "insensitive",
        };
      } else if (filterId === "product.tags" && op === "contains") {
        // ProductTag join: some(tag contains value)
        where.tags = {
          some: {
            tag: { contains: String(value), mode: "insensitive" },
          },
        };
      } else if (filterId === "product.hasImages" && op === "eq") {
        where.hasImages = Boolean(value);
      } else if (filterId === "product.totalInventory" && op === "gte") {
        // VariantRollup to-one relation: is.totalInventory.gte
        where.variantRollup = {
          is: {
            totalInventory: { gte: Number(value) },
          },
        };
      }
    }
  }

  return where;
}

/**
 * Real snapshot builder:
 *  - Creates a SnapshotRun row
 *  - Selects product IDs from FAST plane based on filter
 *  - Inserts SnapshotProduct rows in batches
 *  - Updates progress + events
 *
 * NOTE: this is synchronous in-process. For production you’ll move the inner loop
 * into a BullMQ worker, but the semantics will stay the same.
 */
async function buildSnapshotForPlanHash({ shop, planHash, filterExpr, filterSummary }) {
  // 1) Create run row in RUNNING / 0 progress
  const run = await prisma.snapshotRun.create({
    data: {
      shopId: shop.id,
      planHash,
      filterSummary: filterSummary ?? null,
      state: "RUNNING",
      progress: 0,
      total: 0,
      errorMessage: null,
    },
  });

  const runId = run.id;

  async function logEvent(kind, message) {
    await prisma.snapshotRunEvent.create({
      data: {
        shopId: shop.id,
        snapshotRunId: runId,
        kind,
        message,
      },
    });
  }

  await logEvent("INFO", "Snapshot run started.");

  try {
    const where = buildProductWhereFromFilter(shop.id, filterExpr);

    // 2) Count total matching products
    const total = await prisma.productLite.count({ where });

    await prisma.snapshotRun.update({
      where: { id: runId },
      data: { total },
    });

    await logEvent("INFO", `Planning snapshot for ${total} products.`);

    // 3) Walk products in batches and insert membership rows
    const pageSize = 500;
    let processed = 0;
    let offset = 0;

    while (true) {
      const batch = await prisma.productLite.findMany({
        where,
        orderBy: { updatedAtShopify: "desc" },
        skip: offset,
        take: pageSize,
        select: {
          id: true,
          updatedAtShopify: true,
        },
      });

      if (!batch.length) break;

      await prisma.snapshotProduct.createMany({
        data: batch.map((p) => ({
          shopId: shop.id,
          snapshotRunId: runId,
          productId: p.id,
          sortKey: p.updatedAtShopify ?? new Date(),
        })),
        skipDuplicates: true,
      });

      processed += batch.length;
      offset += batch.length;

      await prisma.snapshotRun.update({
        where: { id: runId },
        data: { progress: processed },
      });

      await logEvent("INFO", `Processed ${processed} of ${total} products.`);
    }

    await prisma.snapshotRun.update({
      where: { id: runId },
      data: { state: "SUCCEEDED" },
    });

    await logEvent("INFO", `Snapshot completed for ${total} products.`);

    return await prisma.snapshotRun.findUnique({ where: { id: runId } });
  } catch (err) {
    console.error("❌ Snapshot run failed:", err);

    await prisma.snapshotRun.update({
      where: { id: runId },
      data: {
        state: "FAILED",
        errorMessage: err.message ?? "Snapshot failed",
      },
    });

    await logEvent("ERROR", err.message ?? "Snapshot failed with unknown error.");

    throw err;
  }
}

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
      return res
        .status(401)
        .json({ errors: [{ message: "Unauthenticated" }] });
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
      const filter =
        variables?.filter ??
        variables?.input?.filter ??
        null;

      const executionMode = "FAST_ONLY"; // currently no SNAPSHOT planner wiring
      const planHash = filter
        ? Buffer.from(JSON.stringify(filter))
            .toString("base64")
            .slice(0, 16)
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

        // Ensure Shop record exists first
        await prisma.shop.upsert({
          where: { shopDomain },
          update: {
            accessToken: session.accessToken,
            updatedAt: new Date(),
          },
          create: {
            shopDomain,
            accessToken: session.accessToken,
          },
        });

        console.log(`✅ Shop row ensured for ${shopDomain}`);

        const shop = await prisma.shop.findUnique({
          where: { shopDomain },
        });

        if (!shop) {
          throw new Error("Shop record not found after upsert");
        }

        console.log(`🔑 Using shop.id=${shop.id} for foreign key`);

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

        // Save to database
        for (const edge of edges) {
          const p = edge.node;

          try {
            await prisma.productLite.upsert({
              where: {
                shopId_id: {
                  shopId: shop.id,
                  id: p.id,
                },
              },
              update: {
                title: p.title,
                handle: p.handle,
                status: p.status,
                vendor: p.vendor || null,
                productType: p.productType || null,
                hasImages: (p.images?.edges?.length || 0) > 0,
                updatedAtShopify: p.updatedAt
                  ? new Date(p.updatedAt)
                  : null,
              },
              create: {
                shopId: shop.id,
                id: p.id,
                title: p.title,
                handle: p.handle,
                status: p.status,
                vendor: p.vendor || null,
                productType: p.productType || null,
                hasImages: (p.images?.edges?.length || 0) > 0,
                updatedAtShopify: p.updatedAt
                  ? new Date(p.updatedAt)
                  : null,
              },
            });

            // VariantRollup rollups (totalInventory)
            const variants = p.variants?.edges?.map((e) => e.node) ?? [];

            const totalInventory = variants.reduce((sum, v) => {
              const qty =
                typeof v.inventoryQuantity === "number"
                  ? v.inventoryQuantity
                  : 0;
              return sum + qty;
            }, 0);

            await prisma.variantRollup.upsert({
              where: {
                shopId_productId: {
                  shopId: shop.id,
                  productId: p.id,
                },
              },
              update: {
                totalInventory,
              },
              create: {
                shopId: shop.id,
                productId: p.id,
                totalInventory,
              },
            });

            // tags
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
              },
            },
          });
        }

        const where = buildProductWhereFromFilter(shop.id, filterExpr);

        console.log(
          `🔎 Prisma where clause:`,
          JSON.stringify(where, null, 2),
        );

        const items = await prisma.productLite.findMany({
          where,
          orderBy: { updatedAtShopify: "desc" },
          take: first,
          skip: after ? parseInt(after, 10) : 0,
          include: {
            tags: true,
          },
        });

        console.log(
          `📦 Found ${items.length} products matching filters`,
        );

        const transformedItems = items.map((item) => ({
          id: item.id,
          title: item.title,
          handle: item.handle,
          status: item.status,
          vendor: item.vendor,
          productType: item.productType,
          tags: item.tags.map((t) => t.tag),
          hasImages: item.hasImages,
          updatedAtShopify: item.updatedAtShopify,
        }));

        const nextCursor =
          items.length === first
            ? String((after ? parseInt(after, 10) : 0) + items.length)
            : null;

        return res.json({
          data: {
            productsByFilter: {
              items: transformedItems,
              nextCursor,
              mode: "FAST_ONLY",
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

    // ───────────────── triggerSnapshotRun (build real snapshot) ─────────────────
    if (query.includes("triggerSnapshotRun")) {
      const planHash = variables?.planHash;
      const filterExpr = variables?.filterJson ?? null;
      const filterSummary = variables?.filterSummary ?? null;

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
        filterSummary,
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
            progress: latestRun.progress,
            total: latestRun.total,
            errorMessage: latestRun.errorMessage,
            filterSummary: latestRun.filterSummary,
            planHash: latestRun.planHash,
            snapshotRunId: String(latestRun.id), // BigInt-safe
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
        orderBy: { sortKey: "desc" },
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
          id: { in: productIds },
        },
        include: { tags: true },
      });

      const items = products.map((item) => ({
        id: item.id,
        title: item.title,
        handle: item.handle,
        status: item.status,
        vendor: item.vendor,
        productType: item.productType,
        tags: item.tags.map((t) => t.tag),
        hasImages: item.hasImages,
        updatedAtShopify: item.updatedAtShopify,
      }));

      const nextCursor =
        memberships.length === first ? String(offset + memberships.length) : null;

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

    // ───────────────── snapshotRuns (connection style for SnapshotJobsPage) ─────────────────
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

    // ───────────────── snapshotRunEvents (supports both simple + connection shapes) ─────────────────
    if (query.includes("snapshotRunEvents")) {
      const runId = variables?.runId;
      if (!runId) {
        return res
          .status(400)
          .json({ errors: [{ message: "runId is required" }] });
      }

      const first = Number(variables?.first ?? 50);
      const after = variables?.after ?? null;

      const shop = await prisma.shop.findUnique({
        where: { shopDomain },
      });

      if (!shop) {
        console.log("⚠️ No Shop row for domain", shopDomain);
        return res.json({
          data: {
            snapshotRunEvents: {
              // simple shape
              events: [],
              nextCursor: null,
              // connection shape
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

      const events = await prisma.snapshotRunEvent.findMany({
        where: { snapshotRunId: runId, shopId: shop.id },
        orderBy: { createdAt: "desc" },
        take: first,
        skip: offset,
      });

      const safeEvents = events.map((ev) => serializePrisma(ev));

      const edges = safeEvents.map((ev, idx) => ({
        cursor: String(offset + idx + 1),
        node: ev,
      }));

      const hasNextPage = events.length === first;
      const endCursor = hasNextPage ? String(offset + events.length) : null;

      return res.json({
        data: {
          snapshotRunEvents: {
            // simple shape
            events: safeEvents,
            nextCursor: endCursor,
            // connection shape
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
    const result = await client.request(
      `query { productsCount { count } }`,
    );
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
        .replace(
          "%VITE_SHOPIFY_API_KEY%",
          process.env.SHOPIFY_API_KEY || "",
        ),
    );
});

// ──────────────────────────────────────────────
// Start server
// ──────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  testDbConnection();
});
