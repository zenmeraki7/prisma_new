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

const PORT = parseInt(process.env.BACKEND_PORT || process.env.PORT || "3000", 10);

const STATIC_PATH =
  process.env.NODE_ENV === "production"
    ? `${process.cwd()}/frontend/dist`
    : `${process.cwd()}/frontend/`;

/* ──────────────────────────────────────────────
   Helper: safely serialize Prisma models (BigInt → string)
────────────────────────────────────────────── */
function serializePrisma(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map((v) => serializePrisma(v));
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = serializePrisma(v);
    return out;
  }
  return value;
}

/* ──────────────────────────────────────────────
   Runtime DB test
────────────────────────────────────────────── */
async function testDbConnection() {
  try {
    await prisma.$connect();
    console.log("✅ Database connected via Prisma");
  } catch (error) {
    console.error("❌ Database connection failed:", error);
  }
}

/* ──────────────────────────────────────────────
   Small parsing helpers
────────────────────────────────────────────── */
function parseBooleanInput(value) {
  if (typeof value === "boolean") return value;
  if (value == null) return false;
  const s = String(value).trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "y";
}

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

/* ──────────────────────────────────────────────
   Normalize filter AST -> leaf list
   (supports MANY shapes to avoid frontend/backend mismatch)
────────────────────────────────────────────── */
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

  // lowercase passthrough
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

  // accept leaf in multiple formats
  const filterId =
    node.filterId ||
    node.key ||
    node.filterKey ||
    node.field ||
    node.path;

  const op = normalizeOp(node.op || node.operator);
  const value = node.value;

  if (!filterId || !op) return null;
  return { type: "leaf", filterId: String(filterId), op, value };
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

  // Some DSLs wrap in { type:'group', and:[...]} etc.
  if (Array.isArray(expr.and)) for (const c of expr.and) normalizeToLeaves(c, out);
  if (Array.isArray(expr.AND)) for (const c of expr.AND) normalizeToLeaves(c, out);
  if (Array.isArray(expr.or)) for (const c of expr.or) normalizeToLeaves(c, out);
  if (Array.isArray(expr.OR)) for (const c of expr.OR) normalizeToLeaves(c, out);
}

/* ──────────────────────────────────────────────
   Build Prisma where from filter leaves
   CRITICAL FIX:
   - use AND[] to avoid overwriting where.variants / where.variantRollup
   - normalize status to Shopify enum strings
   - mode:"insensitive" for string contains
────────────────────────────────────────────── */
function buildProductWhereFromFilter(shopId, filterExprRaw) {
  /** @type {import('@prisma/client').Prisma.ProductLiteWhereInput} */
  const where = { shopId };

  const leaves = [];
  normalizeToLeaves(filterExprRaw, leaves);

  if (leaves.length === 0) return where;

  /** @type {import('@prisma/client').Prisma.ProductLiteWhereInput[]} */
  const AND = [];

  for (const child of leaves) {
    const { filterId, op, value } = child;

    // ───────── PRODUCT FIELDS ─────────

    if (filterId === "product.title" && op === "contains") {
      AND.push({ title: { contains: String(value), mode: "insensitive" } });
      continue;
    }

    if (filterId === "product.vendor" && op === "contains") {
      AND.push({ vendor: { contains: String(value), mode: "insensitive" } });
      continue;
    }

    if (filterId === "product.productType" && op === "contains") {
      AND.push({ productType: { contains: String(value), mode: "insensitive" } });
      continue;
    }

    if (filterId === "product.handle" && op === "contains") {
      AND.push({ handle: { contains: String(value), mode: "insensitive" } });
      continue;
    }

    // Status MUST be EQ (DRAFT/ACTIVE/ARCHIVED). We still allow contains if it's a text column.
    if (filterId === "product.status") {
      const raw = String(value ?? "").trim();
      if (!raw) continue;

      const normalized = raw.toUpperCase(); // Draft -> DRAFT, archived -> ARCHIVED

      if (op === "eq") {
        AND.push({ status: normalized });
      } else if (op === "contains") {
        AND.push({ status: { contains: normalized, mode: "insensitive" } });
      }
      continue;
    }

    // Tags: FAST plane safe default = EXACT match.
    // (Ablestar-like substring tag search needs normalized tag table or snapshot/sql unnest)
    if (filterId === "product.tag") {
      const v = String(value ?? "").trim();
      if (!v) continue;

      // EQ and CONTAINS both behave like exact in this FAST implementation
      AND.push({ tags: { has: v } });
      continue;
    }

    if (filterId === "product.updatedAt" && ["gte", "lte", "gt", "lt", "eq"].includes(op)) {
      const d = parseDateInput(value);
      if (!d) continue;

      if (op === "eq") AND.push({ updatedAtShopify: d });
      else AND.push({ updatedAtShopify: { [op]: d } });
      continue;
    }

    if (filterId === "product.createdAt" && ["gte", "lte", "gt", "lt", "eq"].includes(op)) {
      const d = parseDateInput(value);
      if (!d) continue;

      if (op === "eq") AND.push({ createdAtShopify: d });
      else AND.push({ createdAtShopify: { [op]: d } });
      continue;
    }

    if (filterId === "product.publishedAt" && ["gte", "lte", "gt", "lt", "eq"].includes(op)) {
      const d = parseDateInput(value);
      if (!d) continue;

      if (op === "eq") AND.push({ publishedAtShopify: d });
      else AND.push({ publishedAtShopify: { [op]: d } });
      continue;
    }

    if (filterId === "product.variantCount" && ["gte", "lte", "gt", "lt", "eq"].includes(op)) {
      const n = parseNumberInput(value);
      if (n == null) continue;

      AND.push({ variantCount: op === "eq" ? n : { [op]: n } });
      continue;
    }

    if (filterId === "product.inventoryQuantity" && ["gte", "lte", "gt", "lt", "eq"].includes(op)) {
      const n = parseNumberInput(value);
      if (n == null) continue;

      AND.push({ variantRollup: { is: { totalInventory: op === "eq" ? n : { [op]: n } } } });
      continue;
    }

    // ───────── VARIANT FIELDS ─────────

    if (filterId === "variant.sku" && op === "contains") {
      AND.push({
        variants: { some: { sku: { contains: String(value), mode: "insensitive" } } },
      });
      continue;
    }

    if (filterId === "variant.barcode" && op === "contains") {
      AND.push({
        variants: { some: { barcode: { contains: String(value), mode: "insensitive" } } },
      });
      continue;
    }

    if (filterId === "variant.inventoryQuantity" && ["gte", "lte", "gt", "lt", "eq"].includes(op)) {
      const n = parseNumberInput(value);
      if (n == null) continue;

      AND.push({
        variants: { some: { inventoryQty: op === "eq" ? n : { [op]: n } } },
      });
      continue;
    }
  }

  if (AND.length > 0) where.AND = AND;
  return where;
}

/* ──────────────────────────────────────────────
   Express app
────────────────────────────────────────────── */
const app = express();
app.use(express.json());

/* ──────────────────────────────────────────────
   Shopify authentication + webhooks
────────────────────────────────────────────── */
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

/* ──────────────────────────────────────────────
   API auth middleware
────────────────────────────────────────────── */
app.use("/api/*", shopify.validateAuthenticatedSession());

/* ──────────────────────────────────────────────
   GRAPHQL API (string-dispatch style)
────────────────────────────────────────────── */
app.post("/api/graphql", async (req, res) => {
  try {
    const session = res.locals.shopify?.session;
    if (!session) {
      return res.status(401).json({ errors: [{ message: "Unauthenticated" }] });
    }

    const { query, variables } = req.body || {};
    if (!query || typeof query !== "string") {
      return res.status(400).json({ errors: [{ message: "Missing GraphQL query" }] });
    }

    const client = new shopify.api.clients.Graphql({ session });
    const shopDomain = session.shop;

    /* ───────────────── filterSuggestions ───────────────── */
    if (query.includes("filterSuggestions")) {
      const input = variables?.input || {};
      const key = String(input.key || "");
      const q = String(input.q || "").trim();
      const limit = Math.min(Math.max(Number(input.limit ?? 10), 1), 25);

      if (!q) return res.json({ data: { filterSuggestions: [] } });

      const ALLOWED = new Set([
        "product.vendor",
        "product.productType",
        "product.tag",
        "product.title",
        "product.handle",
        "variant.sku",
        "variant.barcode",
      ]);

      if (!ALLOWED.has(key)) return res.json({ data: { filterSuggestions: [] } });

      const shop = await prisma.shop.findUnique({ where: { shopDomain } });
      if (!shop) return res.json({ data: { filterSuggestions: [] } });

      let values = [];

      if (key === "product.vendor") {
        const rows = await prisma.productLite.findMany({
          where: { shopId: shop.id, vendor: { contains: q, mode: "insensitive" } },
          select: { vendor: true },
          take: limit,
          distinct: ["vendor"],
        });
        values = rows.map((r) => r.vendor).filter(Boolean);
      }

      if (key === "product.productType") {
        const rows = await prisma.productLite.findMany({
          where: { shopId: shop.id, productType: { contains: q, mode: "insensitive" } },
          select: { productType: true },
          take: limit,
          distinct: ["productType"],
        });
        values = rows.map((r) => r.productType).filter(Boolean);
      }

      if (key === "product.tag") {
        // tags is text[]; suggestions need distinct values. Use unnest.
        const rows = await prisma.$queryRawUnsafe(
          `
          select distinct t as value
          from "ProductLite" p
          cross join unnest(p.tags) as t
          where p."shopId" = $1 and t ilike $2
          limit $3
          `,
          shop.id,
          `%${q}%`,
          limit,
        );
        values = (rows || []).map((r) => r.value).filter(Boolean);
      }

      if (key === "product.title") {
        const rows = await prisma.productLite.findMany({
          where: { shopId: shop.id, title: { contains: q, mode: "insensitive" } },
          select: { title: true },
          take: limit,
          distinct: ["title"],
        });
        values = rows.map((r) => r.title).filter(Boolean);
      }

      if (key === "product.handle") {
        const rows = await prisma.productLite.findMany({
          where: { shopId: shop.id, handle: { contains: q, mode: "insensitive" } },
          select: { handle: true },
          take: limit,
          distinct: ["handle"],
        });
        values = rows.map((r) => r.handle).filter(Boolean);
      }

      if (key === "variant.sku") {
        const rows = await prisma.variantLite.findMany({
          where: { shopId: shop.id, sku: { contains: q, mode: "insensitive" } },
          select: { sku: true },
          take: limit,
          distinct: ["sku"],
        });
        values = rows.map((r) => r.sku).filter(Boolean);
      }

      if (key === "variant.barcode") {
        const rows = await prisma.variantLite.findMany({
          where: { shopId: shop.id, barcode: { contains: q, mode: "insensitive" } },
          select: { barcode: true },
          take: limit,
          distinct: ["barcode"],
        });
        values = rows.map((r) => r.barcode).filter(Boolean);
      }

      return res.json({ data: { filterSuggestions: values } });
    }

    /* ───────────────── syncProductsToDb ───────────────── */
    if (query.includes("syncProductsToDb")) {
      try {
        const first = Number(variables?.first ?? 50);
        const after = variables?.after ?? null;

        console.log(`🔄 syncProductsToDb: first=${first}, after=${after}, shopDomain=${shopDomain}`);

        const shop = await prisma.shop.upsert({
          where: { shopDomain },
          update: { accessToken: session.accessToken, updatedAt: new Date() },
          create: { id: shopDomain, shopDomain, accessToken: session.accessToken },
        });

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
                  images(first: 1) { edges { node { id } } }
                  variants(first: 250) {
                    edges { node { inventoryQuantity price compareAtPrice } }
                  }
                }
              }
              pageInfo { hasNextPage }
            }
          }
        `;

        const response = await client.request(shopifyQuery, { variables: { first, after } });
        const edges = response?.data?.products?.edges || [];

        for (const edge of edges) {
          const p = edge.node;
          const variants = p.variants?.edges?.map((e) => e.node) ?? [];

          const totalInventory = variants.reduce((sum, v) => {
            const qty = typeof v.inventoryQuantity === "number" ? v.inventoryQuantity : 0;
            return sum + qty;
          }, 0);

          await prisma.productLite.upsert({
            where: { shopId_productId: { shopId: shop.id, productId: p.id } },
            update: {
              title: p.title,
              handle: p.handle,
              status: p.status,
              vendor: p.vendor || null,
              productType: p.productType || null,
              tags: p.tags || [],
              hasImages: (p.images?.edges?.length || 0) > 0,
              createdAtShopify: p.createdAt ? new Date(p.createdAt) : new Date(),
              updatedAtShopify: p.updatedAt ? new Date(p.updatedAt) : new Date(),
              publishedAtShopify: p.publishedAt ? new Date(p.publishedAt) : null,
              totalInventory,
              variantCount: variants.length || null,
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
              createdAtShopify: p.createdAt ? new Date(p.createdAt) : new Date(),
              updatedAtShopify: p.updatedAt ? new Date(p.updatedAt) : new Date(),
              publishedAtShopify: p.publishedAt ? new Date(p.publishedAt) : null,
              totalInventory,
              variantCount: variants.length || null,
            },
          });

          await prisma.variantRollup.upsert({
            where: { shopId_productId: { shopId: shop.id, productId: p.id } },
            update: { totalInventory, variantCount: variants.length || null },
            create: { shopId: shop.id, productId: p.id, totalInventory, variantCount: variants.length || null },
          });
        }

        const hasNextPage = response?.data?.products?.pageInfo?.hasNextPage || false;
        const nextCursor = hasNextPage && edges.length > 0 ? edges[edges.length - 1].cursor : null;

        return res.json({
          data: { syncProductsToDb: { synced: edges.length, nextCursor, hasNextPage } },
        });
      } catch (syncError) {
        console.error("❌ syncProductsToDb error:", syncError);
        return res.status(500).json({
          errors: [{ message: "Sync failed", details: syncError?.message || String(syncError) }],
        });
      }
    }

    /* ───────────────── productsByFilter (FAST plane) ───────────────── */
    if (query.includes("productsByFilter")) {
      try {
        const input = variables?.input || {};
        const first = Math.min(Math.max(Number(input.first ?? 50), 1), 100);
        const after = input.after ?? null;
        const filterExpr = input.filter || null;

        const shop = await prisma.shop.findUnique({ where: { shopDomain } });
        if (!shop) {
          return res.json({
            data: {
              productsByFilter: {
                items: [],
                nextCursor: null,
                mode: "FAST_ONLY",
                guardrail: { candidateCount: 0, candidateLimit: 0, candidateLimitHit: false },
                warnings: [],
              },
            },
          });
        }

        const where = buildProductWhereFromFilter(shop.id, filterExpr);

        // Offset pagination (keep as-is)
        const offset = after ? parseInt(after, 10) : 0;

        // Helpful debug (turn on if needed)
        // console.log("FILTER RAW:", JSON.stringify(filterExpr, null, 2));
        // console.log("WHERE:", JSON.stringify(where, null, 2));

        const items = await prisma.productLite.findMany({
          where,
          orderBy: { updatedAtShopify: "desc" },
          take: first,
          skip: offset,
        });

        const transformedItems = items.map((item) => ({
          id: item.productId, // outward ID
          productId: item.productId,
          title: item.title,
          handle: item.handle,
          status: item.status,
          vendor: item.vendor,
          productType: item.productType,
          tags: item.tags || [],
          hasImages: item.hasImages,
          updatedAtShopify: item.updatedAtShopify,
          totalInventory: item.totalInventory ?? 0,
          variantCount: item.variantCount ?? 0,
        }));

        const nextCursor = items.length === first ? String(offset + items.length) : null;

        return res.json({
          data: {
            productsByFilter: {
              items: transformedItems,
              nextCursor,
              mode: "FAST_ONLY",
              guardrail: {
                candidateCount: transformedItems.length,
                candidateLimit: 1000000,
                candidateLimitHit: false,
              },
              warnings: [],
            },
          },
        });
      } catch (filterError) {
        console.error("❌ productsByFilter error:", filterError);
        return res.status(500).json({
          errors: [{ message: "Filter query failed", details: filterError?.message || String(filterError) }],
        });
      }
    }

    return res.status(400).json({ errors: [{ message: "Unsupported GraphQL operation" }] });
  } catch (error) {
    console.error("❌ /api/graphql error:", error);
    return res.status(500).json({
      errors: [{ message: "GraphQL server error", details: error?.message || String(error) }],
    });
  }
});

/* ──────────────────────────────────────────────
   REST endpoints (template)
────────────────────────────────────────────── */
app.get("/api/products/count", async (_req, res) => {
  try {
    const client = new shopify.api.clients.Graphql({ session: res.locals.shopify.session });
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
    console.error("❌ Product create failed:", e?.message || e);
    status = 500;
    error = e?.message || String(e);
  }
  res.status(status).send({ success: status === 200, error });
});

/* ──────────────────────────────────────────────
   CSP + Static frontend
────────────────────────────────────────────── */
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

/* ──────────────────────────────────────────────
   Start server
────────────────────────────────────────────── */
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  testDbConnection();
});
