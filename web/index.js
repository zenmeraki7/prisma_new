// FILE: web/index.js
import "dotenv/config";
import { join } from "path";
import { readFileSync } from "fs";
import express from "express";
import serveStatic from "serve-static";

import { productsPgRouter } from "./routes/products.pg.js";
// import { bulkPgRouter } from "./routes/bulk.pg.js";
// import { historyPgRouter } from "./routes/history.pg.js";
import syncPgRoutes from "./routes/sync.pg.js";
import webhooksPgRoutes from "./routes/webhooks.pg.js";

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

/* ─────────────────────────────
   DB TEST
───────────────────────────── */
async function testDbConnection() {
  try {
    await prisma.$connect();
    console.log("✅ Database connected via Prisma");
  } catch (error) {
    console.error("❌ Database connection failed:", error);
  }
}

/* ─────────────────────────────
   Helpers
───────────────────────────── */

function parseNumberInput(value) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseDateInput(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

/* ─────────────────────────────
   Filter Normalization (FAST)
   - shared with productsByFilter FAST plane
───────────────────────────── */

const OP_MAP = new Map([
  ["CONTAINS", "contains"],
  ["NOT_CONTAINS", "not_contains"],
  ["STARTS_WITH", "starts_with"],
  ["ENDS_WITH", "ends_with"],
  ["EQ", "eq"],
  ["NEQ", "neq"],
  ["GT", "gt"],
  ["GTE", "gte"],
  ["LT", "lt"],
  ["LTE", "lte"],
  ["IN", "in"],
  ["NOT_IN", "not_in"],
  ["BETWEEN", "between"],
  ["IS_SET", "is_set"],
  ["IS_NOT_SET", "is_not_set"],

  ["contains", "contains"],
  ["not_contains", "not_contains"],
  ["starts_with", "starts_with"],
  ["ends_with", "ends_with"],
  ["eq", "eq"],
  ["neq", "neq"],
  ["gt", "gt"],
  ["gte", "gte"],
  ["lt", "lt"],
  ["lte", "lte"],
  ["in", "in"],
  ["not_in", "not_in"],
  ["between", "between"],
  ["is_set", "is_set"],
  ["is_not_set", "is_not_set"],
]);

function normalizeOp(op) {
  if (!op) return null;
  const s = String(op).trim();
  return OP_MAP.get(s) || OP_MAP.get(s.toUpperCase()) || null;
}

function normalizeLeaf(node) {
  if (!node || typeof node !== "object") return null;

  const filterId =
    node.filterId || node.key || node.filterKey || node.field || node.path;

  const op = normalizeOp(node.op || node.operator);
  const value = node.value;

  if (!filterId || !op) return null;
  return { filterId: String(filterId), op, value };
}

function normalizeToLeaves(expr, out) {
  if (!expr) return;

  const leaf = normalizeLeaf(expr);
  if (leaf) {
    out.push(leaf);
    return;
  }

  const children = expr.children || expr.filters || expr.nodes;
  if (Array.isArray(children)) {
    for (const c of children) normalizeToLeaves(c, out);
    return;
  }

  if (Array.isArray(expr.and))
    for (const c of expr.and) normalizeToLeaves(c, out);
  if (Array.isArray(expr.AND))
    for (const c of expr.AND) normalizeToLeaves(c, out);
  if (Array.isArray(expr.or))
    for (const c of expr.or) normalizeToLeaves(c, out);
  if (Array.isArray(expr.OR))
    for (const c of expr.OR) normalizeToLeaves(c, out);
}

/**
 * Build a Prisma `where` object for ProductLite from the FAST filterExpr.
 *
 * Supported filterIds (case-insensitive):
 *
 *   product.search
 *   product.status, status, product_status
 *   product.title, title, product_title
 *   product.vendor, vendor, product_vendor
 *   product.productType, product_type, producttype
 *   product.tag, product.tags, tag, product_tag
 *   product.createdAt
 *   product.publishedAt
 *   product.updatedAt
 *
 *   product.totalInventory, product.inventory_quantity, inventory_quantity
 *   product.variantCount, product.variant_count, variant_count
 *
 * Everything else (SKU, barcode, etc.) is ignored on FAST plane.
 */
function buildProductLiteWhereFromFilterExpr(shopId, filterExpr) {
  const andClauses = [{ shopId }];

  if (!filterExpr) {
    return andClauses.length === 1 ? andClauses[0] : { AND: andClauses };
  }

  const leaves = [];
  normalizeToLeaves(filterExpr, leaves);

  for (const leaf of leaves) {
    const { filterId, op, value } = leaf;
    if (!filterId || !op) continue;

    const id = String(filterId).toLowerCase();
    const opNorm = op; // already normalized by normalizeOp

    // 1) product.search
    if (id === "product.search") {
      if (opNorm === "contains" && typeof value === "string") {
        const v = value.trim();
        if (v.length > 0) {
          andClauses.push({
            OR: [
              { title: { contains: v, mode: "insensitive" } },
              { vendor: { contains: v, mode: "insensitive" } },
              { handle: { contains: v, mode: "insensitive" } },
              { productType: { contains: v, mode: "insensitive" } },
              { tags: { has: v } },
            ],
          });
        }
      }
      continue;
    }

    // 2) product.status
    if (id === "product.status" || id === "status" || id === "product_status") {
      if (opNorm === "eq" && typeof value === "string") {
        andClauses.push({
          status: String(value).toUpperCase(),
        });
      } else if (opNorm === "in" && Array.isArray(value)) {
        const vals = value
          .filter((v) => typeof v === "string")
          .map((v) => v.toUpperCase());
        if (vals.length > 0) {
          andClauses.push({
            status: { in: vals },
          });
        }
      }
      continue;
    }

    // 3) product.title
    if (id === "product.title" || id === "title" || id === "product_title") {
      if (opNorm === "contains" && typeof value === "string") {
        const v = value.trim();
        if (v.length > 0) {
          andClauses.push({
            title: { contains: v, mode: "insensitive" },
          });
        }
      }
      continue;
    }

    // 4) product.vendor
    if (id === "product.vendor" || id === "vendor" || id === "product_vendor") {
      if (opNorm === "eq" && typeof value === "string") {
        andClauses.push({ vendor: value });
      } else if (opNorm === "contains" && typeof value === "string") {
        const v = value.trim();
        if (v.length > 0) {
          andClauses.push({
            vendor: { contains: v, mode: "insensitive" },
          });
        }
      }
      continue;
    }

    // 5) product.productType
    if (
      id === "product.producttype" ||
      id === "product.product_type" ||
      id === "producttype" ||
      id === "product_type"
    ) {
      if (opNorm === "eq" && typeof value === "string") {
        andClauses.push({ productType: value });
      } else if (opNorm === "contains" && typeof value === "string") {
        const v = value.trim();
        if (v.length > 0) {
          andClauses.push({
            productType: { contains: v, mode: "insensitive" },
          });
        }
      }
      continue;
    }

    // 6) product.tag(s) → tags[]
    if (id === "product.tag" || id === "product.tags" || id === "tag" || id === "product_tag") {
      if (opNorm === "contains" && typeof value === "string") {
        const v = value.trim();
        if (v.length > 0) {
          andClauses.push({
            tags: { has: v },
          });
        }
      } else if (opNorm === "in" && Array.isArray(value)) {
        const vals = value
          .filter((v) => typeof v === "string")
          .map((v) => v.trim())
          .filter((v) => v.length > 0);
        if (vals.length > 0) {
          andClauses.push({
            tags: { hasSome: vals },
          });
        }
      }
      continue;
    }

    // 7) Dates: created / published / updated
    if (id === "product.createdat") {
      if ((opNorm === "gte" || opNorm === "gt") && typeof value === "string") {
        const d = parseDateInput(value);
        if (d) {
          andClauses.push({
            createdAtShopify: {
              [opNorm === "gt" ? "gt" : "gte"]: d,
            },
          });
        }
      }
      continue;
    }

    if (id === "product.publishedat") {
      if ((opNorm === "gte" || opNorm === "gt") && typeof value === "string") {
        const d = parseDateInput(value);
        if (d) {
          andClauses.push({
            publishedAtShopify: {
              [opNorm === "gt" ? "gt" : "gte"]: d,
            },
          });
        }
      }
      continue;
    }

    if (id === "product.updatedat") {
      if ((opNorm === "gte" || opNorm === "gt") && typeof value === "string") {
        const d = parseDateInput(value);
        if (d) {
          andClauses.push({
            updatedAtShopify: {
              [opNorm === "gt" ? "gt" : "gte"]: d,
            },
          });
        }
      }
      continue;
    }

    // 8) Inventory Quantity (rollup) → variantRollup.totalInventory
    if (
      id === "product.totalinventory" ||
      id === "product.inventory_quantity" ||
      id === "inventory_quantity"
    ) {
      const n = parseNumberInput(value);
      if (n == null) continue;

      if (opNorm === "gt" || opNorm === "gte") {
        andClauses.push({
          variantRollup: {
            totalInventory: {
              [opNorm === "gt" ? "gt" : "gte"]: n,
            },
          },
        });
      } else if (opNorm === "lt" || opNorm === "lte") {
        andClauses.push({
          variantRollup: {
            totalInventory: {
              [opNorm === "lt" ? "lt" : "lte"]: n,
            },
          },
        });
      } else if (opNorm === "eq") {
        andClauses.push({
          variantRollup: { totalInventory: n },
        });
      }
      continue;
    }

    // 9) Variant Count → variantRollup.variantCount
    if (
      id === "product.variantcount" ||
      id === "product.variant_count" ||
      id === "variant_count"
    ) {
      const n = parseNumberInput(value);
      if (n == null) continue;

      if (opNorm === "gt" || opNorm === "gte") {
        andClauses.push({
          variantRollup: {
            variantCount: {
              [opNorm === "gt" ? "gt" : "gte"]: n,
            },
          },
        });
      } else if (opNorm === "lt" || opNorm === "lte") {
        andClauses.push({
          variantRollup: {
            variantCount: {
              [opNorm === "lt" ? "lt" : "lte"]: n,
            },
          },
        });
      } else if (opNorm === "eq") {
        andClauses.push({
          variantRollup: { variantCount: n },
        });
      }
      continue;
    }

    // 10) Unsupported ids for FAST plane → ignore (SKU, barcode, etc.)
  }

  return andClauses.length === 1 ? andClauses[0] : { AND: andClauses };
}

/* ─────────────────────────────
   Express App
───────────────────────────── */

const app = express();
app.use(express.json());

// PG-backed REST endpoints
app.use("/api/pg", productsPgRouter);
// app.use("/api/pg", bulkPgRouter);
// app.use("/api/pg", historyPgRouter);
app.use("/api/pg", syncPgRoutes);
app.use("/api/webhooks/pg", webhooksPgRoutes);

// Shopify OAuth + webhooks
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

// All /api/* routes (including /api/graphql) require an authenticated session
app.use("/api/*", shopify.validateAuthenticatedSession());

/* ─────────────────────────────
   GRAPHQL API
   - syncProductsToDb mutation
   - productsByFilter query (FAST plane via Prisma)
───────────────────────────── */

app.post("/api/graphql", async (req, res) => {
  try {
    const session = res.locals?.shopify?.session;
    if (!session) {
      return res.status(401).json({
        errors: [{ message: "Unauthenticated" }],
      });
    }

    const { query, variables } = req.body || {};
    if (!query || typeof query !== "string") {
      return res.status(400).json({
        errors: [{ message: "Missing GraphQL query" }],
      });
    }

    const client = new shopify.api.clients.Graphql({ session });
    const shopDomain = session.shop; // "my-shop.myshopify.com"
    const shopId = shopDomain; // Use this directly as ProductLite.shopId

    /* ────────────
       1) syncProductsToDb
       ──────────── */
    if (query.includes("syncProductsToDb")) {
      const first = Number(variables?.first ?? 50);
      const after = variables?.after ?? null;

      const response = await client.request(
        `
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
                updatedAt
                publishedAt
              }
            }
            pageInfo {
              hasNextPage
            }
          }
        }
      `,
        { variables: { first, after } },
      );

      const edges = response?.data?.products?.edges || [];

      for (const edge of edges) {
        const p = edge.node;

        await prisma.productLite.upsert({
          where: {
            shopId_id: {
              shopId,
              id: p.id,
            },
          },
          update: {
            title: p.title,
            handle: p.handle,
            status: p.status,
            vendor: p.vendor ?? null,
            productType: p.productType ?? null,
            tags: p.tags ?? [],
            createdAtShopify: p.createdAt ? new Date(p.createdAt) : null,
            updatedAtShopify: p.updatedAt ? new Date(p.updatedAt) : new Date(),
            publishedAtShopify: p.publishedAt ? new Date(p.publishedAt) : null,
          },
          create: {
            shopId,
            id: p.id, // Shopify product GID
            title: p.title,
            handle: p.handle,
            status: p.status,
            vendor: p.vendor ?? null,
            productType: p.productType ?? null,
            tags: p.tags ?? [],
            createdAtShopify: p.createdAt ? new Date(p.createdAt) : null,
            updatedAtShopify: p.updatedAt ? new Date(p.updatedAt) : new Date(),
            publishedAtShopify: p.publishedAt ? new Date(p.publishedAt) : null,
          },
        });
      }

      const pageInfo = response?.data?.products?.pageInfo;
      const hasNextPage = Boolean(pageInfo?.hasNextPage);
      const nextCursor =
        hasNextPage && edges.length > 0 ? edges[edges.length - 1].cursor : null;

      return res.json({
        data: {
          syncProductsToDb: {
            synced: edges.length,
            nextCursor,
            hasNextPage,
          },
        },
      });
    }

    /* ────────────
       2) productsByFilter (FAST plane via Prisma)
       Uses ProductLite + VariantRollup
       ──────────── */
    if (query.includes("productsByFilter")) {
      const input = variables?.input ?? {};
      const first = Number(input.first ?? 50);
      const after = input.after ?? null;

      const filterExpr = input.filter ?? input.filterExpr ?? input.filterGroup ?? null;
      const pageSize = Math.min(Math.max(first, 1), 250);

      const where = buildProductLiteWhereFromFilterExpr(shopId, filterExpr);

      const cursor =
        after != null
          ? { shopId_id: { shopId, id: String(after) } }
          : undefined;

      const products = await prisma.productLite.findMany({
        where,
        include: {
          variantRollup: true,
        },
        orderBy: {
          updatedAtShopify: "desc",
        },
        take: pageSize + 1,
        ...(cursor
          ? {
              skip: 1,
              cursor,
            }
          : {}),
      });

      const slice = products.slice(0, pageSize);
      const hasNextPage = products.length > pageSize;
      const nextCursor = hasNextPage ? slice[slice.length - 1].id : null;

      const items = slice.map((p) => ({
        id: p.id,
        title: p.title,
        handle: p.handle,
        status: p.status,
        vendor: p.vendor,
        productType: p.productType,
        tags: p.tags,
        hasImages: p.hasImages,
        totalInventory: p.variantRollup ? p.variantRollup.totalInventory : 0,
        variantCount: p.variantRollup ? p.variantRollup.variantCount : 0,
        updatedAtShopify: p.updatedAtShopify,
      }));

      const guardrail = {
        candidateCount: items.length,
        candidateLimit: pageSize,
        candidateLimitHit: hasNextPage,
      };

      return res.json({
        data: {
          productsByFilter: {
            items,
            nextCursor,
            mode: "FAST",
            guardrail,
            warnings: [],
          },
        },
      });
    }

    // Everything else is still unsupported
    return res.status(400).json({
      errors: [{ message: "Unsupported GraphQL operation" }],
    });
  } catch (error) {
    console.error("❌ GraphQL error:", error);
    return res.status(500).json({
      errors: [
        {
          message: "GraphQL server error",
          details: (error && error.message) || String(error),
        },
      ],
    });
  }
});

/* ─────────────────────────────
   REST (legacy demo endpoint)
───────────────────────────── */

app.post("/api/products", async (req, res) => {
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

/* ─────────────────────────────
   Static + App Shell
───────────────────────────── */

app.use(shopify.cspHeaders());
app.use(serveStatic(STATIC_PATH, { index: false }));

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

/* ─────────────────────────────
   Start Server
───────────────────────────── */

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  testDbConnection();
});