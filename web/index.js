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
   Parse helpers
────────────────────────────────────────────── */
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

  if (Array.isArray(expr.and)) for (const c of expr.and) normalizeToLeaves(c, out);
  if (Array.isArray(expr.AND)) for (const c of expr.AND) normalizeToLeaves(c, out);
  if (Array.isArray(expr.or)) for (const c of expr.or) normalizeToLeaves(c, out);
  if (Array.isArray(expr.OR)) for (const c of expr.OR) normalizeToLeaves(c, out);
}

/* ──────────────────────────────────────────────
   ✅ Stable "mixed" ordering (seeded hash)
   - NOT ASC/DESC
   - stable across pagination if seed is constant
────────────────────────────────────────────── */
function fnv1a32(str) {
  let h = 0x811c9dc5; // 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193); // 16777619
  }
  return h >>> 0;
}

function mixedRank(productId, seed) {
  // returns uint32
  return fnv1a32(`${seed}::${productId}`);
}

async function fetchMixedProductPage({ shopId, where, first, offset, seed }) {
  // Guardrail: cap matched IDs we’re willing to "mix" in memory.
  // Raise later once you move to SQL compiler.
  const MAX_MIX_CANDIDATES = 20000;

  // Step 1: fetch candidate productIds only (cheap columns)
  // NOTE: no orderBy – DB returns some natural order (irrelevant; we re-sort)
  const idRows = await prisma.productLite.findMany({
    where,
    select: { productId: true },
    take: MAX_MIX_CANDIDATES,
  });

  const ids = idRows.map((r) => r.productId);

  // Step 2: stable mixed sort by seeded hash
  ids.sort((a, b) => {
    const ra = mixedRank(a, seed);
    const rb = mixedRank(b, seed);
    if (ra !== rb) return ra - rb;
    // tie-breaker for absolute determinism
    return a < b ? -1 : a > b ? 1 : 0;
  });

  // Step 3: slice page
  const pageIds = ids.slice(offset, offset + first);

  if (pageIds.length === 0) return { items: [], nextCursor: null, candidateCount: ids.length };

  // Step 4: fetch full rows for those ids
  const rows = await prisma.productLite.findMany({
    where: { shopId, productId: { in: pageIds } },
  });

  // Step 5: reorder rows exactly in pageIds order
  const byId = new Map(rows.map((r) => [r.productId, r]));
  const ordered = pageIds.map((id) => byId.get(id)).filter(Boolean);

  const nextCursor = offset + first < ids.length ? String(offset + pageIds.length) : null;

  return {
    items: ordered,
    nextCursor,
    candidateCount: ids.length,
  };
}

/* ──────────────────────────────────────────────
   Build Prisma where from filter leaves
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

    // ✅ Search bar: title/vendor/handle/type OR tags(has)
    if (filterId === "product.search" && op === "contains") {
      const q = String(value ?? "").trim();
      if (!q) continue;

      AND.push({
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { vendor: { contains: q, mode: "insensitive" } },
          { handle: { contains: q, mode: "insensitive" } },
          { productType: { contains: q, mode: "insensitive" } },
          { tags: { has: q } }, // FAST tags: exact token match
        ],
      });
      continue;
    }

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

    if (filterId === "product.status") {
      const raw = String(value ?? "").trim();
      if (!raw) continue;
      const normalized = raw.toUpperCase();

      if (op === "eq") {
        AND.push({ status: normalized });
      } else if (op === "contains") {
        AND.push({ status: { contains: normalized, mode: "insensitive" } });
      }
      continue;
    }

    if (filterId === "product.tag") {
      const v = String(value ?? "").trim();
      if (!v) continue;
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

    /* ───────────────── productsByFilter (FAST plane) ───────────────── */
    if (query.includes("productsByFilter")) {
      const input = variables?.input || {};
      const first = Math.min(Math.max(Number(input.first ?? 50), 1), 100);
      const after = input.after ?? null;
      const filterExpr = input.filter || null;

      // ✅ IMPORTANT: seed controls the “mixed” order.
      // If FE doesn't send seed, this stays stable per filter (good for pagination).
      const seed =
        typeof input.seed === "string" && input.seed.trim()
          ? input.seed.trim()
          : `shop:${shopDomain}::filter:${JSON.stringify(filterExpr ?? null)}`;

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

      // Offset pagination
      const offset = after ? parseInt(after, 10) : 0;

      // ✅ Mixed + pagination-safe
      const page = await fetchMixedProductPage({
        shopId: shop.id,
        where,
        first,
        offset,
        seed,
      });

      const transformedItems = page.items.map((item) => ({
        id: item.productId,
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

      return res.json({
        data: {
          productsByFilter: {
            items: transformedItems,
            nextCursor: page.nextCursor,
            mode: "FAST_ONLY",
            guardrail: {
              candidateCount: page.candidateCount,
              candidateLimit: 20000,
              candidateLimitHit: page.candidateCount >= 20000,
            },
            warnings: page.candidateCount >= 20000 ? ["MIX_ORDER_CAPPED"] : [],
          },
        },
      });
    }

    /* ───────────────── syncProductsToDb (unchanged) ───────────────── */
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
