// web/lib/snapshots/shopifySnapshotEvaluator.ts
import type { FilterExpr, FilterLeafExpr } from "../filters/dsl.js";
import { getFilterDef, FILTER_REGISTRY } from "../filters/registry.js";
import {
  startBulkOp,
  waitBulkOpUrl,
  streamJsonlObjectsFromUrl,
} from "./shopifyBulkOp.js";
import { getShopifyAdminClient } from "../../shopifyClient.js";

type SnapshotEvalParams = {
  shopId: string;
  filter: FilterExpr;
};

/**
 * Evaluate a SNAPSHOT-plane (or mixed) filter expression by fetching products/variants via
 * Shopify BulkOperations and applying the expression locally.
 *
 * Returns the set of Shopify product GIDs which satisfy the SNAPSHOT filter.
 *
 * NOTE: This does not write SnapshotRun / SnapshotProduct; that’s the worker’s job.
 * This function is pure in terms of DB side effects.
 */
export async function evaluateSnapshotFilterToProductGids(
  params: SnapshotEvalParams
): Promise<Set<string>> {
  const { shopId, filter } = params;

  const client = await getShopifyAdminClient(shopId);

  // 1) Build a bulk query that includes all fields used by SNAPSHOT-plane filters
  const bulkQuery = buildSnapshotBulkQuery();

  const bulkOpId = await startBulkOp(client, bulkQuery);
  const url = await waitBulkOpUrl(client, bulkOpId);

  const matches = new Set<string>();

  for await (const obj of streamJsonlObjectsFromUrl(url)) {
    // Depending on your BulkOps export, you may receive many node types (products, variants etc.).
    // Here we assume top-level "product" nodes, with nested variants included, since the query is built that way.
    const node = normalizeBulkProductNode(obj);
    if (!node) continue;

    if (matchesSnapshotExpr(node, filter)) {
      matches.add(node.id);
    }
  }

  return matches;
}

/* =======================================================================
 * Bulk query & payload helpers
 * ==================================================================== */

/**
 * Build a BulkOperation GraphQL query including all fields required for SNAPSHOT-plane filters
 * defined in FILTER_REGISTRY.
 */
function buildSnapshotBulkQuery(): string {
  // We know from registry which paths we need; but for simplicity we select a superset.
  // This is safe and you can trim later if needed.
  return `
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
            tags
            createdAt
            updatedAt
            publishedAt
            onlineStoreUrl
            templateSuffix
            totalInventory
            variants(first: 250) {
              edges {
                node {
                  id
                  sku
                  title
                  price
                  compareAtPrice
                  inventoryQuantity
                  inventoryPolicy
                  requiresShipping
                  taxable
                  weight
                  barcode
                  selectedOptions {
                    name
                    value
                  }
                  metafields(first: 50) {
                    edges {
                      node {
                        id
                        namespace
                        key
                        value
                        type
                      }
                    }
                  }
                }
              }
            }
            metafields(first: 50) {
              edges {
                node {
                  id
                  namespace
                  key
                  value
                  type
                }
              }
            }
            images(first: 10) {
              edges {
                node {
                  id
                  src
                }
              }
            }
          }
        }
      }
    }
  `;
}

type SnapshotProductNode = {
  id: string;
  title?: string | null;
  handle?: string | null;
  status?: string | null;
  vendor?: string | null;
  productType?: string | null;
  tags?: string[] | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  publishedAt?: string | null;
  onlineStoreUrl?: string | null;
  templateSuffix?: string | null;
  totalInventory?: number | null;
  variants?: any[];
  metafields?: any[];
  images?: any[];
};

/**
 * Takes a raw BulkOps JSONL item and, if it represents a product node,
 * normalizes it into a SnapshotProductNode. Adjust if your BulkOps helper
 * wraps nodes differently.
 */
function normalizeBulkProductNode(obj: any): SnapshotProductNode | null {
  // Typical BulkOps export has objects with "id" and other fields at top level.
  // If you export multiple node types you may want to guard by __typename.
  if (!obj || typeof obj !== "object") return null;
  if (!obj.id) return null;
  // Accept as product
  const variants =
    obj.variants?.edges?.map((e: any) => e.node) ??
    obj.variants ??
    [];
  const metafields =
    obj.metafields?.edges?.map((e: any) => e.node) ??
    obj.metafields ??
    [];
  const images =
    obj.images?.edges?.map((e: any) => e.node) ?? obj.images ?? [];

  return {
    id: obj.id,
    title: obj.title ?? null,
    handle: obj.handle ?? null,
    status: obj.status ?? null,
    vendor: obj.vendor ?? null,
    productType: obj.productType ?? null,
    tags: Array.isArray(obj.tags) ? obj.tags : null,
    createdAt: obj.createdAt ?? null,
    updatedAt: obj.updatedAt ?? null,
    publishedAt: obj.publishedAt ?? null,
    onlineStoreUrl: obj.onlineStoreUrl ?? null,
    templateSuffix: obj.templateSuffix ?? null,
    totalInventory:
      typeof obj.totalInventory === "number" ? obj.totalInventory : null,
    variants,
    metafields,
    images,
  };
}

/* =======================================================================
 * Local evaluation of snapshot expression
 * ==================================================================== */

function matchesSnapshotExpr(
  product: SnapshotProductNode,
  expr: FilterExpr
): boolean {
  if (expr.type === "leaf") {
    return matchesSnapshotLeaf(product, expr);
  }

  const { op, children } = expr;
  if (!children || children.length === 0) return true;

  if (op === "and") {
    return children.every((c) => matchesSnapshotExpr(product, c as FilterExpr));
  }
  if (op === "or") {
    return children.some((c) => matchesSnapshotExpr(product, c as FilterExpr));
  }
  if (op === "not") {
    if (children.length !== 1) {
      throw new Error("Snapshot evaluator: NOT group must have exactly one child.");
    }
    return !matchesSnapshotExpr(product, children[0] as FilterExpr);
  }

  throw new Error(`Snapshot evaluator: unknown group op: ${op}`);
}

function matchesSnapshotLeaf(
  product: SnapshotProductNode,
  leaf: FilterLeafExpr
): boolean {
  const def = getFilterDef(leaf.filterId);
  if (!def || def.plane !== "SNAPSHOT") {
    // FAST-plane filters are ignored here; for mixed plans you combine
    // FAST + SNAPSHOT results via IDs (planner). But when executing
    // a pure snapshot evaluator, you should only see SNAPSHOT leaves.
    return true;
  }

  const path = def.snapshotField?.shopifyPath;
  if (!path) {
    throw new Error(
      `Snapshot evaluator: filterId "${def.key}" is SNAPSHOT but missing snapshotField.shopifyPath.`
    );
  }

  // Value extraction depends on scope (product vs variant).
  // For product-scope filters we evaluate once per product.
  // For variant-scope filters we succeed if ANY variant matches.
  if (def.scope === "product") {
    const value = extractProductField(product, path);
    return evalOp(leaf.op, value, leaf.value, def.valueKind);
  }

  if (def.scope === "variant") {
    const variants = product.variants ?? [];
    for (const variant of variants) {
      const value = extractVariantField(variant, path);
      if (evalOp(leaf.op, value, leaf.value, def.valueKind)) {
        return true;
      }
    }
    return false;
  }

  return false;
}

/* =======================================================================
 * Path extraction
 * ==================================================================== */

function extractProductField(node: SnapshotProductNode, path: string): unknown {
  // Handle a few special pseudo paths
  if (path === "product.variants.length") {
    return Array.isArray(node.variants) ? node.variants.length : 0;
  }
  if (path === "product.metafields") {
    return node.metafields;
  }
  if (path === "product.variants") {
    return node.variants;
  }

  return getByPath(node, path.replace(/^product\./, ""));
}

function extractVariantField(variant: any, path: string): unknown {
  if (path === "variant.metafields") {
    return (
      variant.metafields?.edges?.map((e: any) => e.node) ??
      variant.metafields ??
      []
    );
  }
  return getByPath(variant, path.replace(/^variant\./, ""));
}

/**
 * Very small path evaluator supporting patterns like:
 * - "title"
 * - "variants.requiresShipping" (not used here)
 * - "selectedOptions[0].value"
 */
function getByPath(obj: any, path: string): unknown {
  const segments = path.split(".");
  let current: any = obj;

  for (const seg of segments) {
    if (current == null) return undefined;

    const arrayMatch = /^([a-zA-Z0-9_]+)\[(\d+)\]$/.exec(seg);
    if (arrayMatch) {
      const [, key, indexStr] = arrayMatch;
      const index = Number(indexStr);
      const arr = current[key];
      if (!Array.isArray(arr) || index < 0 || index >= arr.length) {
        return undefined;
      }
      current = arr[index];
      continue;
    }

    current = current[seg];
  }

  return current;
}

/* =======================================================================
 * Operator evaluation
 * ==================================================================== */

function evalOp(
  op: FilterLeafExpr["op"],
  fieldValue: unknown,
  rawValue: unknown,
  valueKind: string
): boolean {
  // Unary
  if (op === "is_set") {
    return fieldValue !== null && fieldValue !== undefined;
  }
  if (op === "is_not_set") {
    return fieldValue === null || fieldValue === undefined;
  }

  const fv = fieldValue;

  // Some value kinds get special treatment, but we can keep this generic for now
  switch (op) {
    case "eq":
      return eq(fv, rawValue, valueKind);
    case "neq":
      return !eq(fv, rawValue, valueKind);

    case "contains":
      return contains(fv, rawValue);
    case "not_contains":
      return !contains(fv, rawValue);

    case "starts_with":
      return startsWith(fv, rawValue);
    case "ends_with":
      return endsWith(fv, rawValue);

    case "in":
      return inList(fv, rawValue);
    case "not_in":
      return !inList(fv, rawValue);

    case "gt":
    case "gte":
    case "lt":
    case "lte":
    case "between":
      return compare(op, fv, rawValue, valueKind);

    default:
      throw new Error(`Snapshot evaluator: unsupported op "${op}".`);
  }
}

function eq(a: unknown, b: unknown, valueKind: string): boolean {
  if (valueKind === "datetime") {
    const da = toDateOrNull(a);
    const db = toDateOrNull(b);
    if (!da || !db) return false;
    return da.getTime() === db.getTime();
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => v === b[i]);
  }
  return a === b;
}

function contains(a: unknown, b: unknown): boolean {
  if (Array.isArray(a)) {
    return a.some((v) => v === b);
  }
  if (typeof a === "string" && typeof b === "string") {
    return a.toLowerCase().includes(b.toLowerCase());
  }
  return false;
}

function startsWith(a: unknown, b: unknown): boolean {
  if (typeof a === "string" && typeof b === "string") {
    return a.toLowerCase().startsWith(b.toLowerCase());
  }
  return false;
}

function endsWith(a: unknown, b: unknown): boolean {
  if (typeof a === "string" && typeof b === "string") {
    return a.toLowerCase().endsWith(b.toLowerCase());
  }
  return false;
}

function inList(a: unknown, b: unknown): boolean {
  const arr = Array.isArray(b) ? b : [b];
  return arr.some((v) => v === a);
}

function compare(
  op: "gt" | "gte" | "lt" | "lte" | "between",
  a: unknown,
  raw: unknown,
  valueKind: string
): boolean {
  if (valueKind === "datetime") {
    const da = toDateOrNull(a);
    if (!da) return false;

    if (op === "between") {
      const [from, to] = normalizeBetweenDate(raw);
      return da >= from && da <= to;
    }

    const db = toDateOrNull(raw);
    if (!db) return false;

    if (op === "gt") return da > db;
    if (op === "gte") return da >= db;
    if (op === "lt") return da < db;
    if (op === "lte") return da <= db;
    return false;
  }

  // numeric comparison
  const na = Number(a);
  if (!Number.isFinite(na)) return false;

  if (op === "between") {
    const [from, to] = normalizeBetweenNumeric(raw);
    return na >= from && na <= to;
  }

  const nb = Number(raw);
  if (!Number.isFinite(nb)) return false;

  if (op === "gt") return na > nb;
  if (op === "gte") return na >= nb;
  if (op === "lt") return na < nb;
  if (op === "lte") return na <= nb;
  return false;
}

function normalizeBetweenNumeric(raw: unknown): [number, number] {
  if (Array.isArray(raw) && raw.length === 2) {
    const [a, b] = raw;
    const n1 = Number(a);
    const n2 = Number(b);
    if (!Number.isFinite(n1) || !Number.isFinite(n2)) {
      return [Number.NaN, Number.NaN];
    }
    return n1 <= n2 ? [n1, n2] : [n2, n1];
  }
  if (
    typeof raw === "object" &&
    raw !== null &&
    "min" in raw &&
    "max" in raw
  ) {
    const anyRaw = raw as { min: unknown; max: unknown };
    const n1 = Number(anyRaw.min);
    const n2 = Number(anyRaw.max);
    if (!Number.isFinite(n1) || !Number.isFinite(n2)) {
      return [Number.NaN, Number.NaN];
    }
    return n1 <= n2 ? [n1, n2] : [n2, n1];
  }
  return [Number.NaN, Number.NaN];
}

function normalizeBetweenDate(raw: unknown): [Date, Date] {
  if (Array.isArray(raw) && raw.length === 2) {
    const [a, b] = raw;
    const d1 = toDateOrNull(a);
    const d2 = toDateOrNull(b);
    if (!d1 || !d2) return [new Date(0), new Date(0)];
    return d1 <= d2 ? [d1, d2] : [d2, d1];
  }
  if (
    typeof raw === "object" &&
    raw !== null &&
    "from" in raw &&
    "to" in raw
  ) {
    const anyRaw = raw as { from: unknown; to: unknown };
    const d1 = toDateOrNull(anyRaw.from);
    const d2 = toDateOrNull(anyRaw.to);
    if (!d1 || !d2) return [new Date(0), new Date(0)];
    return d1 <= d2 ? [d1, d2] : [d2, d1];
  }
  return [new Date(0), new Date(0)];
}

function toDateOrNull(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}
