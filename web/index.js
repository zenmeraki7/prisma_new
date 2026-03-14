import "dotenv/config";
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

/* -------------------------------------------------------------------------- */
/* Bootstrap                                                                   */
/* -------------------------------------------------------------------------- */

async function testDbConnection() {
  try {
    await prisma.$connect();
    console.log("✅ Database connected via Prisma");
  } catch (error) {
    console.error("❌ Database connection failed:", error);
  }
}

/* -------------------------------------------------------------------------- */
/* Primitive helpers                                                           */
/* -------------------------------------------------------------------------- */

function parseNumberInput(value) {
  if (value === "" || value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseDateInput(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseBooleanInput(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    if (s === "true") return true;
    if (s === "false") return false;
  }
  return null;
}

function normalizeString(value) {
  return String(value ?? "").trim();
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) {
    return value.map((v) => normalizeString(v)).filter(Boolean);
  }
  const single = normalizeString(value);
  return single ? [single] : [];
}

function uniqueStrings(values) {
  return [
    ...new Set(
      (values || []).filter(
        (v) => typeof v === "string" && v.trim().length > 0,
      ),
    ),
  ];
}

function safeJsonParse(input) {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function parseLooseStringArray(value) {
  if (Array.isArray(value)) {
    return value.map((x) => normalizeString(x)).filter(Boolean);
  }

  const s = normalizeString(value);
  if (!s) return [];

  const direct = safeJsonParse(s);
  if (Array.isArray(direct)) {
    return direct.map((x) => normalizeString(x)).filter(Boolean);
  }

  if (s.startsWith('"[') && s.endsWith(']"')) {
    const unwrapped = safeJsonParse(s);
    if (typeof unwrapped === "string") {
      const parsed = safeJsonParse(unwrapped);
      if (Array.isArray(parsed)) {
        return parsed.map((x) => normalizeString(x)).filter(Boolean);
      }
    }
  }

  return [s];
}

function toNullableDecimalNumber(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toLowerStatus(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeWeightUnitInput(value) {
  const s = String(value ?? "").trim().toLowerCase();
  if (!s) return null;

  if (s === "g" || s === "gram" || s === "grams") return "g";
  if (s === "kg" || s === "kilogram" || s === "kilograms") return "kg";
  if (s === "oz" || s === "ounce" || s === "ounces") return "oz";
  if (s === "lb" || s === "lbs" || s === "pound" || s === "pounds") return "lb";

  return s;
}

function normalizeWeightUnitArray(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeWeightUnitInput).filter(Boolean);
  }

  const single = normalizeWeightUnitInput(value);
  return single ? [single] : [];
}

function normalizeShopifyWeightUnit(value) {
  const s = String(value ?? "").trim().toLowerCase();
  if (!s) return null;

  if (s === "g" || s === "gram" || s === "grams") return "g";
  if (s === "kg" || s === "kilogram" || s === "kilograms") return "kg";
  if (s === "oz" || s === "ounce" || s === "ounces") return "oz";
  if (s === "lb" || s === "lbs" || s === "pound" || s === "pounds") return "lb";

  return s;
}

function weightToGrams(weight, unit) {
  const n = toNullableDecimalNumber(weight);
  if (n == null) return null;

  const u = normalizeShopifyWeightUnit(unit);
  if (u === "kg") return Math.round(n * 1000);
  if (u === "g") return Math.round(n);
  if (u === "lb") return Math.round(n * 453.59237);
  if (u === "oz") return Math.round(n * 28.3495231);

  return Math.round(n);
}

function selectedOptionValue(selectedOptions, index) {
  if (!Array.isArray(selectedOptions)) return null;
  return selectedOptions[index]?.value ?? null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function reconnectPrisma() {
  try {
    await prisma.$disconnect();
  } catch {}

  await sleep(300);

  try {
    await prisma.$connect();
  } catch {}
}

function isRetryableDbError(err) {
  const msg = String(err?.message || err || "");

  return (
    err?.code === "P1001" ||
    err?.code === "P1002" ||
    err?.name === "PrismaClientInitializationError" ||
    msg.includes("Can't reach database server") ||
    msg.includes("Please make sure your database server is running") ||
    msg.includes("Connection terminated") ||
    msg.includes("Connection reset") ||
    msg.includes("server closed the connection unexpectedly") ||
    msg.includes("Unable to start a transaction in the given time") ||
    msg.includes("timeout") ||
    msg.includes("Timed out") ||
    msg.includes("Too many connections")
  );
}

function computeProfitMarginPct(price, cost) {
  const p = toNullableDecimalNumber(price);
  const c = toNullableDecimalNumber(cost);

  if (p == null || c == null || p === 0) return null;
  return Number((((p - c) / p) * 100).toFixed(4));
}

/* -------------------------------------------------------------------------- */
/* Operator normalization                                                      */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/* Filter AST normalization                                                    */
/* -------------------------------------------------------------------------- */

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

  if (Array.isArray(expr.and)) {
    for (const c of expr.and) normalizeToLeaves(c, out);
  }
  if (Array.isArray(expr.AND)) {
    for (const c of expr.AND) normalizeToLeaves(c, out);
  }
  if (Array.isArray(expr.or)) {
    for (const c of expr.or) normalizeToLeaves(c, out);
  }
  if (Array.isArray(expr.OR)) {
    for (const c of expr.OR) normalizeToLeaves(c, out);
  }
}

/* -------------------------------------------------------------------------- */
/* Prisma clause builders                                                      */
/* -------------------------------------------------------------------------- */

function buildInsensitiveStringClause(column, opNorm, value) {
  if (opNorm === "is_set") return { [column]: { not: null } };
  if (opNorm === "is_not_set") return { [column]: null };

  const v = normalizeString(value);
  if (!v) return null;

  if (opNorm === "eq") {
    return { [column]: { equals: v, mode: "insensitive" } };
  }
  if (opNorm === "neq") {
    return { NOT: { [column]: { equals: v, mode: "insensitive" } } };
  }
  if (opNorm === "contains") {
    return { [column]: { contains: v, mode: "insensitive" } };
  }
  if (opNorm === "not_contains") {
    return { NOT: { [column]: { contains: v, mode: "insensitive" } } };
  }
  if (opNorm === "starts_with") {
    return { [column]: { startsWith: v, mode: "insensitive" } };
  }
  if (opNorm === "ends_with") {
    return { [column]: { endsWith: v, mode: "insensitive" } };
  }
  if (opNorm === "in") {
    const vals = normalizeStringArray(value);
    if (!vals.length) return null;
    return {
      OR: vals.map((x) => ({
        [column]: { equals: x, mode: "insensitive" },
      })),
    };
  }
  if (opNorm === "not_in") {
    const vals = normalizeStringArray(value);
    if (!vals.length) return null;
    return {
      AND: vals.map((x) => ({
        NOT: {
          [column]: { equals: x, mode: "insensitive" },
        },
      })),
    };
  }

  return null;
}

function buildCaseInsensitiveExactListClause(column, opNorm, value) {
  const vals = normalizeStringArray(value)
    .map((s) => s.toLowerCase())
    .filter(Boolean);

  if (!vals.length) return null;

  if (opNorm === "eq") {
    return {
      [column]: {
        equals: vals[0],
        mode: "insensitive",
      },
    };
  }

  if (opNorm === "neq") {
    return {
      NOT: {
        [column]: {
          equals: vals[0],
          mode: "insensitive",
        },
      },
    };
  }

  if (opNorm === "in") {
    return {
      OR: vals.map((v) => ({
        [column]: {
          equals: v,
          mode: "insensitive",
        },
      })),
    };
  }

  if (opNorm === "not_in") {
    return {
      AND: vals.map((v) => ({
        NOT: {
          [column]: {
            equals: v,
            mode: "insensitive",
          },
        },
      })),
    };
  }

  return null;
}

function buildNumericFieldClause(column, opNorm, value) {
  if (opNorm === "is_set") return { [column]: { not: null } };
  if (opNorm === "is_not_set") return { [column]: null };

  if (opNorm === "between") {
    const a = parseNumberInput(value?.[0]);
    const b = parseNumberInput(value?.[1]);

    const range = {};
    if (a != null) range.gte = a;
    if (b != null) range.lte = b;

    return Object.keys(range).length ? { [column]: range } : null;
  }

  const n = parseNumberInput(value);
  if (n == null) return null;

  if (opNorm === "eq") return { [column]: n };
  if (opNorm === "neq") return { NOT: { [column]: n } };
  if (
    opNorm === "gt" ||
    opNorm === "gte" ||
    opNorm === "lt" ||
    opNorm === "lte"
  ) {
    return { [column]: { [opNorm]: n } };
  }

  return null;
}

function buildDateFieldClause(column, opNorm, value) {
  if (opNorm === "is_set") return { [column]: { not: null } };
  if (opNorm === "is_not_set") return { [column]: null };

  if (opNorm === "between") {
    const from = parseDateInput(value?.[0]);
    const to = parseDateInput(value?.[1]);
    const range = {};
    if (from) range.gte = from;
    if (to) range.lte = to;
    return Object.keys(range).length ? { [column]: range } : null;
  }

  const d = parseDateInput(value);
  if (!d) return null;

  if (opNorm === "eq") return { [column]: d };
  if (
    opNorm === "gt" ||
    opNorm === "gte" ||
    opNorm === "lt" ||
    opNorm === "lte"
  ) {
    return { [column]: { [opNorm]: d } };
  }

  return null;
}

function buildVariantSomeStringClause(shopId, column, opNorm, value) {
  const normalizedValue =
    column === "weightUnit"
      ? (Array.isArray(value)
          ? normalizeWeightUnitArray(value)
          : normalizeWeightUnitInput(value))
      : value;

  const base = buildInsensitiveStringClause(column, opNorm, normalizedValue);
  if (!base) return null;

  return {
    variants: {
      some: {
        shopId,
        ...base,
      },
    },
  };
}

function buildVariantSomeNumberClause(shopId, column, opNorm, value) {
  const base = buildNumericFieldClause(column, opNorm, value);
  if (!base) return null;

  return {
    variants: {
      some: {
        shopId,
        ...base,
      },
    },
  };
}

function buildVariantSomeBooleanClause(shopId, column, value, opNorm = "eq") {
  if (opNorm === "is_set") {
    return {
      variants: {
        some: {
          shopId,
          [column]: { not: null },
        },
      },
    };
  }

  if (opNorm === "is_not_set") {
    return {
      variants: {
        some: {
          shopId,
          [column]: null,
        },
      },
    };
  }

  const b = parseBooleanInput(value);
  if (b == null) return null;

  if (opNorm === "neq") {
    return {
      variants: {
        some: {
          shopId,
          NOT: {
            [column]: b,
          },
        },
      },
    };
  }

  return {
    variants: {
      some: {
        shopId,
        [column]: b,
      },
    },
  };
}

function buildCollectionsClause(shopId, opNorm, value) {
  if (opNorm === "is_set") {
    return {
      collections: {
        some: { shopId },
      },
    };
  }

  if (opNorm === "is_not_set") {
    return {
      collections: {
        none: { shopId },
      },
    };
  }

  const v = normalizeString(value);
  if (!v && opNorm !== "in") return null;

  if (opNorm === "in") {
    const vals = normalizeStringArray(value);
    if (!vals.length) return null;

    return {
      collections: {
        some: {
          shopId,
          OR: vals.flatMap((x) => [
            { collectionTitle: { equals: x, mode: "insensitive" } },
            { collectionHandle: { equals: x, mode: "insensitive" } },
            { collectionId: { equals: x } },
          ]),
        },
      },
    };
  }

  const matcher =
    opNorm === "eq"
      ? {
          OR: [
            { collectionTitle: { equals: v, mode: "insensitive" } },
            { collectionHandle: { equals: v, mode: "insensitive" } },
            { collectionId: { equals: v } },
          ],
        }
      : opNorm === "contains"
        ? {
            OR: [
              { collectionTitle: { contains: v, mode: "insensitive" } },
              { collectionHandle: { contains: v, mode: "insensitive" } },
              { collectionId: { contains: v } },
            ],
          }
        : opNorm === "starts_with"
          ? {
              OR: [
                { collectionTitle: { startsWith: v, mode: "insensitive" } },
                { collectionHandle: { startsWith: v, mode: "insensitive" } },
                { collectionId: { startsWith: v } },
              ],
            }
          : opNorm === "ends_with"
            ? {
                OR: [
                  { collectionTitle: { endsWith: v, mode: "insensitive" } },
                  { collectionHandle: { endsWith: v, mode: "insensitive" } },
                  { collectionId: { endsWith: v } },
                ],
              }
            : null;

  if (!matcher) return null;

  return {
    collections: {
      some: {
        shopId,
        ...matcher,
      },
    },
  };
}

function buildInventoryLocationClause(shopId, opNorm, value) {
  const v = normalizeString(value);
  if (!v && opNorm !== "is_set" && opNorm !== "is_not_set") return null;

  if (opNorm === "is_set") {
    return {
      inventoryByLoc: {
        some: { shopId },
      },
    };
  }

  if (opNorm === "is_not_set") {
    return {
      inventoryByLoc: {
        none: { shopId },
      },
    };
  }

  if (opNorm === "eq") {
    return {
      inventoryByLoc: {
        some: {
          shopId,
          OR: [
            { locationId: v },
            { locationName: { equals: v, mode: "insensitive" } },
          ],
        },
      },
    };
  }

  if (opNorm === "contains") {
    return {
      inventoryByLoc: {
        some: {
          shopId,
          OR: [
            { locationId: { contains: v } },
            { locationName: { contains: v, mode: "insensitive" } },
          ],
        },
      },
    };
  }

  if (opNorm === "in") {
    const vals = normalizeStringArray(value);
    if (!vals.length) return null;

    return {
      inventoryByLoc: {
        some: {
          shopId,
          OR: vals.flatMap((x) => [
            { locationId: x },
            { locationName: { equals: x, mode: "insensitive" } },
          ]),
        },
      },
    };
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* Filter compiler                                                             */
/* -------------------------------------------------------------------------- */

function buildWhereAndWarnings(shopId, filterExpr) {
  const andClauses = [{ shopId }];
  const warnings = [];

  if (!filterExpr) {
    return {
      where: andClauses.length === 1 ? andClauses[0] : { AND: andClauses },
      warnings,
    };
  }

  const leaves = [];
  normalizeToLeaves(filterExpr, leaves);

  for (const leaf of leaves) {
    const { filterId, op, value } = leaf;
    if (!filterId || !op) continue;

    const id = String(filterId).trim().toLowerCase();
    const opNorm = op;
    let clause = null;

    if (id === "product.search") {
      const v = normalizeString(value);
      if (v) {
        clause = {
          OR: [
            { title: { contains: v, mode: "insensitive" } },
            { vendor: { contains: v, mode: "insensitive" } },
            { handle: { contains: v, mode: "insensitive" } },
            { productType: { contains: v, mode: "insensitive" } },
            { tags: { has: v } },
          ],
        };
      }
    } else if (
      id === "product.status" ||
      id === "status" ||
      id === "product_status"
    ) {
      clause = buildCaseInsensitiveExactListClause("status", opNorm, value);
    } else if (
      id === "product.title" ||
      id === "title" ||
      id === "product_title"
    ) {
      clause = buildInsensitiveStringClause("title", opNorm, value);
    } else if (
      id === "product.handle" ||
      id === "handle" ||
      id === "product_handle"
    ) {
      clause = buildInsensitiveStringClause("handle", opNorm, value);
    } else if (
      id === "product.vendor" ||
      id === "vendor" ||
      id === "product_vendor"
    ) {
      clause = buildInsensitiveStringClause("vendor", opNorm, value);
    } else if (
      id === "product.producttype" ||
      id === "product.product_type" ||
      id === "producttype" ||
      id === "product_type"
    ) {
      clause = buildInsensitiveStringClause("productType", opNorm, value);
    } else if (id === "product.id" || id === "id" || id === "product_id") {
      const v = normalizeString(value);
      if (opNorm === "eq" && v) clause = { id: v };
      else if (opNorm === "contains" && v) clause = { id: { contains: v } };
      else if (opNorm === "starts_with" && v) clause = { id: { startsWith: v } };
      else if (opNorm === "ends_with" && v) clause = { id: { endsWith: v } };
    } else if (
      id === "product.tag" ||
      id === "product.tags" ||
      id === "tag" ||
      id === "product_tag"
    ) {
      const vals = parseLooseStringArray(value);

      if (opNorm === "contains" || opNorm === "eq") {
        if (vals.length === 1) clause = { tags: { has: vals[0] } };
        else if (vals.length > 1) clause = { tags: { hasSome: vals } };
      } else if (opNorm === "in") {
        if (vals.length) clause = { tags: { hasSome: vals } };
      } else if (opNorm === "not_in") {
        if (vals.length) clause = { NOT: { tags: { hasSome: vals } } };
      }
    } else if (id === "product.createdat") {
      clause = buildDateFieldClause("createdAtShopify", opNorm, value);
    } else if (id === "product.publishedat") {
      clause = buildDateFieldClause("publishedAtShopify", opNorm, value);
    } else if (id === "product.updatedat") {
      clause = buildDateFieldClause("updatedAtShopify", opNorm, value);
    } else if (
      id === "product.totalinventory" ||
      id === "product.inventoryquantity" ||
      id === "product.inventory_quantity" ||
      id === "inventory_quantity"
    ) {
      const inner = buildNumericFieldClause("totalInventory", opNorm, value);
      if (inner) clause = { variantRollup: { is: inner } };
    } else if (
      id === "product.variantcount" ||
      id === "product.variant_count" ||
      id === "variant_count"
    ) {
      const inner = buildNumericFieldClause("variantCount", opNorm, value);
      if (inner) clause = { variantRollup: { is: inner } };
    } else if (id === "product.collection") {
      clause = buildCollectionsClause(shopId, opNorm, value);
    } else if (id === "variant.sku") {
      clause = buildVariantSomeStringClause(shopId, "sku", opNorm, value);
    } else if (id === "variant.barcode") {
      clause = buildVariantSomeStringClause(shopId, "barcode", opNorm, value);
    } else if (id === "variant.title") {
      clause = buildVariantSomeStringClause(shopId, "title", opNorm, value);
    } else if (id === "variant.compareatprice") {
      clause = buildVariantSomeNumberClause(shopId, "compareAtPrice", opNorm, value);
    } else if (
      id === "variant.cost" ||
      id === "cost"
    ) {
      clause = buildVariantSomeNumberClause(shopId, "cost", opNorm, value);
    } else if (id === "variant.price") {
      clause = buildVariantSomeNumberClause(shopId, "price", opNorm, value);
    } else if (
      id === "variant.profitmargin" ||
      id === "variant.profitmarginpct" ||
      id === "profitmargin" ||
      id === "profit_margin" ||
      id === "profit_margin_pct"
    ) {
      clause = buildVariantSomeNumberClause(shopId, "profitMarginPct", opNorm, value);
    } else if (
      id === "variant.trackquantity" ||
      id === "variant.track_quantity" ||
      id === "trackquantity" ||
      id === "track_quantity"
    ) {
      clause = buildVariantSomeBooleanClause(shopId, "trackQuantity", value, opNorm);
    } else if (id === "variant.chargetax") {
      clause = buildVariantSomeBooleanClause(shopId, "taxable", value, opNorm);
    } else if (
      id === "variant.physicalproduct" ||
      id === "variant.physical_product" ||
      id === "physicalproduct" ||
      id === "physical_product" ||
      id === "variant.requiresshipping" ||
      id === "requiresshipping"
    ) {
      clause = buildVariantSomeBooleanClause(shopId, "requiresShipping", value, opNorm);
    } else if (
      id === "variant.inventoryquantity" ||
      id === "variant.inventory_quantity"
    ) {
      clause = buildVariantSomeNumberClause(shopId, "inventoryQty", opNorm, value);
    } else if (id === "variant.inventorypolicy") {
      clause = buildVariantSomeStringClause(shopId, "inventoryPolicy", opNorm, value);
    } else if (id === "variant.option1value") {
      clause = buildVariantSomeStringClause(shopId, "option1Value", opNorm, value);
    } else if (id === "variant.option2value") {
      clause = buildVariantSomeStringClause(shopId, "option2Value", opNorm, value);
    } else if (id === "variant.option3value") {
      clause = buildVariantSomeStringClause(shopId, "option3Value", opNorm, value);
    } else if (id === "variant.weightunit") {
      const normalizedValue =
        opNorm === "in" || opNorm === "not_in"
          ? normalizeWeightUnitArray(value)
          : normalizeWeightUnitInput(value);

      clause = buildVariantSomeStringClause(
        shopId,
        "weightUnit",
        opNorm,
        normalizedValue,
      );
    } else if (id === "variant.weight") {
      clause = buildVariantSomeNumberClause(shopId, "weightGrams", opNorm, value);
    } else if (
      id === "variant.connectedinventorylocation" ||
      id === "variant.inventorylocation"
    ) {
      clause = buildInventoryLocationClause(shopId, opNorm, value);
    } else if (
      id === "variant.countryoforigin" ||
      id === "variant.country_of_origin" ||
      id === "countryoforigin" ||
      id === "country_of_origin"
    ) {
      clause = buildVariantSomeStringClause(shopId, "countryOfOrigin", opNorm, value);
    } else if (
      id === "variant.hstariffcode" ||
      id === "variant.hs_tariff_code" ||
      id === "hstariffcode" ||
      id === "hs_tariff_code"
    ) {
      clause = buildVariantSomeStringClause(shopId, "hsTariffCode", opNorm, value);
    } else if (id === "product.category") {
      clause = buildInsensitiveStringClause("categoryName", opNorm, value);
    } else if (id === "product.description") {
      clause = buildInsensitiveStringClause("description", opNorm, value);
    } else if (id === "product.option1name") {
      clause = buildInsensitiveStringClause("option1Name", opNorm, value);
    } else if (id === "product.option2name") {
      clause = buildInsensitiveStringClause("option2Name", opNorm, value);
    } else if (id === "product.option3name") {
      clause = buildInsensitiveStringClause("option3Name", opNorm, value);
    } else if (
      id === "product.template" ||
      id === "product.themetemplate" ||
      id === "product.theme_template" ||
      id === "product.templatesuffix" ||
      id === "product.template_suffix"
    ) {
      clause = buildInsensitiveStringClause("templateSuffix", opNorm, value);
    } else if (
      id === "product.searchenginevisibility" ||
      id === "product.seohidden" ||
      id === "product.seo_hidden"
    ) {
      const boolValue = parseBooleanInput(value);

      if (opNorm === "is_set") {
        clause = { seoHidden: { not: null } };
      } else if (opNorm === "is_not_set") {
        clause = { seoHidden: null };
      } else if (boolValue != null) {
        clause =
          opNorm === "neq"
            ? { NOT: { seoHidden: boolValue } }
            : { seoHidden: boolValue };
      } else {
        warnings.push(`Filter "${filterId}" requires boolean value true/false.`);
      }
    } else if (
      id === "product.visibleonlinestore" ||
      id === "product.visible_online_store"
    ) {
      const boolValue = parseBooleanInput(value);

      if (opNorm === "is_set") {
        clause = { visibleOnlineStore: { not: null } };
      } else if (opNorm === "is_not_set") {
        clause = { visibleOnlineStore: null };
      } else if (boolValue != null) {
        clause =
          opNorm === "neq"
            ? { NOT: { visibleOnlineStore: boolValue } }
            : { visibleOnlineStore: boolValue };
      } else {
        warnings.push(`Filter "${filterId}" requires boolean value true/false.`);
      }
    } else if (
      id === "product.visiblepos" ||
      id === "product.visible_pos"
    ) {
      const boolValue = parseBooleanInput(value);

      if (opNorm === "is_set") {
        clause = { visiblePos: { not: null } };
      } else if (opNorm === "is_not_set") {
        clause = { visiblePos: null };
      } else if (boolValue != null) {
        clause =
          opNorm === "neq"
            ? { NOT: { visiblePos: boolValue } }
            : { visiblePos: boolValue };
      } else {
        warnings.push(`Filter "${filterId}" requires boolean value true/false.`);
      }
    } else {
      warnings.push(`Unsupported filter "${filterId}" was ignored.`);
    }

    if (clause) andClauses.push(clause);
  }

  return {
    where: andClauses.length === 1 ? andClauses[0] : { AND: andClauses },
    warnings: uniqueStrings(warnings),
  };
}

/* -------------------------------------------------------------------------- */
/* Suggestions                                                                 */
/* -------------------------------------------------------------------------- */

async function getFilterSuggestions(shopId, key, q, limit = 10) {
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 25);
  const term = normalizeString(q);
  if (!term) return [];

  const k = String(key || "").trim();

  if (k === "product.handle") {
    const rows = await prisma.productLite.findMany({
      where: { shopId, handle: { contains: term, mode: "insensitive" } },
      select: { handle: true },
      orderBy: { id: "asc" },
      take: safeLimit,
    });
    return uniqueStrings(rows.map((r) => r.handle));
  }

  if (k === "product.title") {
    const rows = await prisma.productLite.findMany({
      where: { shopId, title: { contains: term, mode: "insensitive" } },
      select: { title: true },
      orderBy: { id: "asc" },
      take: safeLimit,
    });
    return uniqueStrings(rows.map((r) => r.title));
  }

  if (k === "product.vendor") {
    const rows = await prisma.productLite.findMany({
      where: { shopId, vendor: { contains: term, mode: "insensitive" } },
      select: { vendor: true },
      orderBy: { id: "asc" },
      take: safeLimit,
    });
    return uniqueStrings(rows.map((r) => r.vendor));
  }

  if (k === "product.productType") {
    const rows = await prisma.productLite.findMany({
      where: { shopId, productType: { contains: term, mode: "insensitive" } },
      select: { productType: true },
      orderBy: { id: "asc" },
      take: safeLimit,
    });
    return uniqueStrings(rows.map((r) => r.productType));
  }

  if (k === "product.category") {
    const rows = await prisma.productLite.findMany({
      where: { shopId, categoryName: { contains: term, mode: "insensitive" } },
      select: { categoryName: true },
      orderBy: { id: "asc" },
      take: safeLimit,
    });
    return uniqueStrings(rows.map((r) => r.categoryName));
  }

  if (k === "product.description") {
    const rows = await prisma.productLite.findMany({
      where: { shopId, description: { contains: term, mode: "insensitive" } },
      select: { description: true },
      orderBy: { id: "asc" },
      take: safeLimit,
    });
    return uniqueStrings(rows.map((r) => r.description));
  }

  if (k === "product.option1Name") {
    const rows = await prisma.productLite.findMany({
      where: { shopId, option1Name: { contains: term, mode: "insensitive" } },
      select: { option1Name: true },
      orderBy: { id: "asc" },
      take: safeLimit,
    });
    return uniqueStrings(rows.map((r) => r.option1Name));
  }

  if (k === "product.option2Name") {
    const rows = await prisma.productLite.findMany({
      where: { shopId, option2Name: { contains: term, mode: "insensitive" } },
      select: { option2Name: true },
      orderBy: { id: "asc" },
      take: safeLimit,
    });
    return uniqueStrings(rows.map((r) => r.option2Name));
  }

  if (k === "product.option3Name") {
    const rows = await prisma.productLite.findMany({
      where: { shopId, option3Name: { contains: term, mode: "insensitive" } },
      select: { option3Name: true },
      orderBy: { id: "asc" },
      take: safeLimit,
    });
    return uniqueStrings(rows.map((r) => r.option3Name));
  }

  if (k === "product.tag") {
    const rows = await prisma.productLite.findMany({
      where: { shopId },
      select: { tags: true },
      orderBy: { id: "asc" },
      take: 300,
    });

    const effectiveTerm = term.toLowerCase();
    const out = [];
    const seen = new Set();

    for (const row of rows) {
      for (const tag of row.tags || []) {
        const t = normalizeString(tag);
        if (!t) continue;
        if (effectiveTerm && !t.toLowerCase().includes(effectiveTerm)) continue;
        if (seen.has(t)) continue;
        seen.add(t);
        out.push(t);
        if (out.length >= safeLimit) return out;
      }
    }

    return out;
  }

  if (k === "product.status") {
    return ["active", "draft", "archived"].filter((s) =>
      s.includes(term.toLowerCase()),
    );
  }

  if (k === "product.collection") {
    const rows = await prisma.productCollection.findMany({
      where: {
        shopId,
        OR: [
          { collectionTitle: { contains: term, mode: "insensitive" } },
          { collectionHandle: { contains: term, mode: "insensitive" } },
          { collectionId: { contains: term } },
        ],
      },
      select: {
        collectionTitle: true,
        collectionHandle: true,
        collectionId: true,
      },
      take: safeLimit * 3,
      orderBy: { collectionId: "asc" },
    });

    return uniqueStrings(
      rows.flatMap((r) => [r.collectionTitle, r.collectionHandle, r.collectionId]),
    ).slice(0, safeLimit);
  }

  if (k === "variant.sku") {
    const rows = await prisma.variantLite.findMany({
      where: { shopId, sku: { contains: term, mode: "insensitive" } },
      select: { sku: true },
      orderBy: { variantId: "asc" },
      take: safeLimit,
    });
    return uniqueStrings(rows.map((r) => r.sku));
  }

  if (k === "variant.barcode") {
    const rows = await prisma.variantLite.findMany({
      where: { shopId, barcode: { contains: term, mode: "insensitive" } },
      select: { barcode: true },
      orderBy: { variantId: "asc" },
      take: safeLimit,
    });
    return uniqueStrings(rows.map((r) => r.barcode));
  }

  if (k === "variant.title") {
    const rows = await prisma.variantLite.findMany({
      where: { shopId, title: { contains: term, mode: "insensitive" } },
      select: { title: true },
      orderBy: { variantId: "asc" },
      take: safeLimit,
    });
    return uniqueStrings(rows.map((r) => r.title));
  }

  if (k === "variant.inventoryPolicy") {
    return ["deny", "continue"].filter((s) =>
      s.includes(term.toLowerCase()),
    );
  }

  if (k === "variant.weightUnit") {
    const options = [
      { label: "Grams", value: "g" },
      { label: "Kilograms", value: "kg" },
      { label: "Ounces", value: "oz" },
      { label: "Pounds", value: "lb" },
    ];

    const qNorm = term.toLowerCase();

    return options
      .filter((opt) =>
        opt.label.toLowerCase().includes(qNorm) || opt.value.includes(qNorm),
      )
      .map((opt) => opt.value);
  }

  if (
    k === "variant.connectedInventoryLocation" ||
    k === "variant.inventoryLocation"
  ) {
    const rows = await prisma.productInventoryLocation.findMany({
      where: {
        shopId,
        OR: [
          { locationId: { contains: term } },
          { locationName: { contains: term, mode: "insensitive" } },
        ],
      },
      select: {
        locationId: true,
        locationName: true,
      },
      orderBy: { locationName: "asc" },
      take: safeLimit * 3,
    });

    return uniqueStrings(
      rows.flatMap((r) => [r.locationName, r.locationId]),
    ).slice(0, safeLimit);
  }

  if (k === "variant.option1Value") {
    const rows = await prisma.variantLite.findMany({
      where: { shopId, option1Value: { contains: term, mode: "insensitive" } },
      select: { option1Value: true },
      orderBy: { variantId: "asc" },
      take: safeLimit,
    });
    return uniqueStrings(rows.map((r) => r.option1Value));
  }

  if (k === "variant.option2Value") {
    const rows = await prisma.variantLite.findMany({
      where: { shopId, option2Value: { contains: term, mode: "insensitive" } },
      select: { option2Value: true },
      orderBy: { variantId: "asc" },
      take: safeLimit,
    });
    return uniqueStrings(rows.map((r) => r.option2Value));
  }

  if (k === "variant.option3Value") {
    const rows = await prisma.variantLite.findMany({
      where: { shopId, option3Value: { contains: term, mode: "insensitive" } },
      select: { option3Value: true },
      orderBy: { variantId: "asc" },
      take: safeLimit,
    });
    return uniqueStrings(rows.map((r) => r.option3Value));
  }

  return [];
}

/* -------------------------------------------------------------------------- */
/* Sync writers                                                                */
/* -------------------------------------------------------------------------- */

function buildProductTagRows(shopId, productId, tags) {
  const cleanTags = uniqueStrings(
    Array.isArray(tags) ? tags.map((t) => normalizeString(t)) : [],
  );

  return cleanTags.map((tag) => ({
    shopId,
    productId,
    tag,
  }));
}

function buildVariantRecordsFromProduct(shopId, productNode) {
  const variantEdges = productNode?.variants?.edges || [];

  return variantEdges
    .map((edge) => edge?.node)
    .filter(Boolean)
    .map((variant) => {
      const price = toNullableDecimalNumber(variant.price);
      const compareAtPrice = toNullableDecimalNumber(variant.compareAtPrice);

      const inventoryItem = variant.inventoryItem ?? null;

      const cost =
        inventoryItem?.unitCost?.amount != null
          ? toNullableDecimalNumber(inventoryItem.unitCost.amount)
          : null;

      const rawWeightValue =
        inventoryItem?.measurement?.weight?.value != null
          ? inventoryItem.measurement.weight.value
          : null;

      const rawWeightUnit =
        inventoryItem?.measurement?.weight?.unit != null
          ? inventoryItem.measurement.weight.unit
          : null;

      const normalizedWeightUnit = normalizeShopifyWeightUnit(rawWeightUnit);

      return {
        shopId,
        variantId: variant.id,
        productId: productNode.id,
        title: variant.title ?? null,
        sku: variant.sku ?? null,
        barcode: variant.barcode ?? null,
        price,
        compareAtPrice,
        cost,
        profitMarginPct: computeProfitMarginPct(price, cost),
        taxable:
          typeof variant.taxable === "boolean" ? variant.taxable : null,
        trackQuantity:
          typeof inventoryItem?.tracked === "boolean"
            ? inventoryItem.tracked
            : null,
        requiresShipping:
          typeof inventoryItem?.requiresShipping === "boolean"
            ? inventoryItem.requiresShipping
            : null,
        inventoryQty:
          typeof variant.inventoryQuantity === "number"
            ? variant.inventoryQuantity
            : 0,
        inventoryPolicy: variant.inventoryPolicy ?? null,
        countryOfOrigin: inventoryItem?.countryCodeOfOrigin ?? null,
        hsTariffCode: inventoryItem?.harmonizedSystemCode ?? null,
        weightGrams: weightToGrams(rawWeightValue, normalizedWeightUnit),
        weightUnit: normalizedWeightUnit,
        option1Value: selectedOptionValue(variant.selectedOptions, 0),
        option2Value: selectedOptionValue(variant.selectedOptions, 1),
        option3Value: selectedOptionValue(variant.selectedOptions, 2),
      };
    });
}

function buildVariantRollupData(variants) {
  const variantCount = variants.length;
  const inventoryValues = variants.map((v) => v.inventoryQty ?? 0);
  const totalInventory = inventoryValues.reduce((sum, n) => sum + n, 0);

  const priceValues = variants
    .map((v) => (v.price != null ? Number(v.price) : null))
    .filter((v) => v != null);

  const compareAtValues = variants
    .map((v) => (v.compareAtPrice != null ? Number(v.compareAtPrice) : null))
    .filter((v) => v != null);

  const costValues = variants
    .map((v) => (v.cost != null ? Number(v.cost) : null))
    .filter((v) => v != null);

  return {
    variantCount,
    totalInventory,
    minPrice: priceValues.length ? Math.min(...priceValues) : null,
    maxPrice: priceValues.length ? Math.max(...priceValues) : null,
    minCompareAtPrice: compareAtValues.length
      ? Math.min(...compareAtValues)
      : null,
    maxCompareAtPrice: compareAtValues.length
      ? Math.max(...compareAtValues)
      : null,
    minCost: costValues.length ? Math.min(...costValues) : null,
    maxCost: costValues.length ? Math.max(...costValues) : null,
    hasOutOfStockVariant: inventoryValues.some((n) => n <= 0),
    hasInStockVariant: inventoryValues.some((n) => n > 0),
  };
}

function buildProductInventoryLocationRows(_shopId, _productNode) {
  return [];
}

async function syncSingleProductGraphNode(shopId, productNode) {
  const productId = productNode.id;
  const optionNames = Array.isArray(productNode.options) ? productNode.options : [];
  const tagRows = buildProductTagRows(shopId, productId, productNode.tags);
  const variantRecords = buildVariantRecordsFromProduct(shopId, productNode);
  const rollup = buildVariantRollupData(variantRecords);
  const inventoryLocationRows = buildProductInventoryLocationRows(shopId, productNode);

  await prisma.productLite.upsert({
    where: {
      shopId_id: {
        shopId,
        id: productId,
      },
    },
    update: {
      title: productNode.title,
      handle: productNode.handle,
      status: toLowerStatus(productNode.status),
      vendor: productNode.vendor ?? null,
      productType: productNode.productType ?? null,
      categoryId: productNode.category?.id ?? null,
      categoryName: productNode.category?.name ?? null,
      description: productNode.description ?? null,
      templateSuffix: productNode.templateSuffix ?? null,
      option1Name: optionNames[0]?.name ?? null,
      option2Name: optionNames[1]?.name ?? null,
      option3Name: optionNames[2]?.name ?? null,
      tags: Array.isArray(productNode.tags) ? productNode.tags : [],
      createdAtShopify: productNode.createdAt
        ? new Date(productNode.createdAt)
        : null,
      updatedAtShopify: productNode.updatedAt
        ? new Date(productNode.updatedAt)
        : new Date(),
      publishedAtShopify: productNode.publishedAt
        ? new Date(productNode.publishedAt)
        : null,
    },
    create: {
      shopId,
      id: productId,
      title: productNode.title,
      handle: productNode.handle,
      status: toLowerStatus(productNode.status),
      vendor: productNode.vendor ?? null,
      productType: productNode.productType ?? null,
      categoryId: productNode.category?.id ?? null,
      categoryName: productNode.category?.name ?? null,
      description: productNode.description ?? null,
      templateSuffix: productNode.templateSuffix ?? null,
      option1Name: optionNames[0]?.name ?? null,
      option2Name: optionNames[1]?.name ?? null,
      option3Name: optionNames[2]?.name ?? null,
      tags: Array.isArray(productNode.tags) ? productNode.tags : [],
      createdAtShopify: productNode.createdAt
        ? new Date(productNode.createdAt)
        : null,
      updatedAtShopify: productNode.updatedAt
        ? new Date(productNode.updatedAt)
        : new Date(),
      publishedAtShopify: productNode.publishedAt
        ? new Date(productNode.publishedAt)
        : null,
    },
  });

  await prisma.productTag.deleteMany({
    where: { shopId, productId },
  });

  if (tagRows.length > 0) {
    await prisma.productTag.createMany({
      data: tagRows,
      skipDuplicates: true,
    });
  }

  await prisma.variantLite.deleteMany({
    where: {
      shopId,
      productId,
    },
  });

  if (variantRecords.length > 0) {
    await prisma.variantLite.createMany({
      data: variantRecords,
      skipDuplicates: true,
    });
  }

  await prisma.variantRollup.upsert({
    where: {
      shopId_productId: {
        shopId,
        productId,
      },
    },
    update: rollup,
    create: {
      shopId,
      productId,
      ...rollup,
    },
  });

  if (inventoryLocationRows.length > 0) {
    await prisma.productInventoryLocation.deleteMany({
      where: { shopId, productId },
    });

    await prisma.productInventoryLocation.createMany({
      data: inventoryLocationRows,
      skipDuplicates: true,
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Shopify sync query                                                          */
/* -------------------------------------------------------------------------- */

const SYNC_PRODUCTS_QUERY = `
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
        description
        tags
        createdAt
        updatedAt
        publishedAt
        templateSuffix

        category {
          id
          name
        }

        options {
          name
        }

        variants(first: 100) {
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
              taxable

              inventoryItem {
                tracked
                requiresShipping
                unitCost {
                  amount
                }
                countryCodeOfOrigin
                harmonizedSystemCode
                measurement {
                  weight {
                    value
                    unit
                  }
                }
              }

              selectedOptions {
                name
                value
              }
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

/* -------------------------------------------------------------------------- */
/* Express app                                                                 */
/* -------------------------------------------------------------------------- */

const app = express();
app.use(express.json());

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

app.use("/api/*", shopify.validateAuthenticatedSession());

/* -------------------------------------------------------------------------- */
/* GraphQL-lite endpoint                                                       */
/* -------------------------------------------------------------------------- */

const SYNC_PRODUCTS_PAGE_MAX = 50;
const SYNC_PRODUCT_CONCURRENCY = 5;

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function run() {
    while (true) {
      const current = nextIndex++;
      if (current >= items.length) return;
      results[current] = await worker(items[current], current);
    }
  }

  const runners = Array.from(
    { length: Math.min(limit, items.length || 0) },
    () => run(),
  );

  await Promise.all(runners);
  return results;
}

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
    const shopId = String(session.shop);

    if (query.includes("filterSuggestions")) {
      const input = variables?.input ?? {};
      const suggestions = await getFilterSuggestions(
        shopId,
        input.key,
        input.q,
        input.limit,
      );

      return res.json({
        data: {
          filterSuggestions: suggestions,
        },
      });
    }

    if (query.includes("syncProductsToDb")) {
      const first = Math.min(
        Math.max(Number(variables?.first ?? SYNC_PRODUCTS_PAGE_MAX), 1),
        SYNC_PRODUCTS_PAGE_MAX,
      );
      const after = variables?.after ?? null;

      const response = await client.request(SYNC_PRODUCTS_QUERY, {
        variables: { first, after },
      });

      const edges = response?.data?.products?.edges || [];

      await mapWithConcurrency(
        edges,
        SYNC_PRODUCT_CONCURRENCY,
        async (edge) => {
          const productNode = edge?.node;
          if (!productNode?.id) return;

          let lastError = null;
          let synced = false;

          for (let attempt = 1; attempt <= 3; attempt += 1) {
            try {
              await syncSingleProductGraphNode(shopId, productNode);
              synced = true;
              break;
            } catch (err) {
              lastError = err;
              const msg = String(err?.message || err);

              const retryable =
                msg.includes("Unable to start a transaction in the given time") ||
                msg.includes("timeout") ||
                msg.includes("Timed out") ||
                msg.includes("Too many connections");

              if (!retryable || attempt === 3) {
                throw err;
              }

              await sleep(100 * attempt);
            }
          }

          if (!synced && lastError) {
            throw lastError;
          }
        },
      );

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

    if (query.includes("productsByFilter")) {
      const input = variables?.input ?? {};
      const first = Number(input.first ?? 50);
      const after = input.after ?? null;
      const pageSize = Math.min(Math.max(first, 1), 250);

      const filterExpr =
        input.filter ?? input.filterExpr ?? input.filterGroup ?? null;

      const { where, warnings } = buildWhereAndWarnings(shopId, filterExpr);

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
          id: "asc",
        },
        take: pageSize + 1,
        ...(cursor
          ? {
              skip: 1,
              cursor,
            }
          : {}),
      });

      const totalMatched = await prisma.productLite.count({ where });

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

      return res.json({
        data: {
          productsByFilter: {
            items,
            nextCursor,
            mode: "FAST_ONLY",
            guardrail: {
              totalMatched,
              shownCount: slice.length,
              pageSize,
              hasMore: hasNextPage,
              limited: hasNextPage,
            },
            warnings,
          },
        },
      });
    }

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

/* -------------------------------------------------------------------------- */
/* Legacy demo route                                                           */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/* Static app shell                                                            */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/* Start server                                                                */
/* -------------------------------------------------------------------------- */

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  testDbConnection();
});