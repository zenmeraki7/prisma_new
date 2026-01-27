// web/lib/filters/shopifySearchCompiler.ts
//
// Compile your filter DSL (filterJson) into a Shopify products(query: "...") string,
// using the FILTER_SEARCH_REGISTRY as the single source of truth.
//
// Important rules:
// - Only filters with searchToken !== null participate in BulkOps search.
// - If the filter tree contains ONLY FAST-only filters, the result is "" (no query),
//   and you should NOT use BulkOps for that plan.
// - If some leaves are expressible and some are not, we currently ignore the
//   non-expressible leaves for BulkOps, but you may choose to reject BulkOps
//   instead (see isBulkOpsCompatible below).

import {
  FILTER_SEARCH_REGISTRY,
  type FilterId,
  type FilterOperatorId,
  type FilterValue,
  filterSupportsShopifySearch,
} from "./searchRegistry";

/* ========================================================================== *
 * Filter AST types (adapt these to your real DSL)
 * ========================================================================== */

export type FilterGroupOp = "AND" | "OR";

export interface FilterLeafNode {
  type: "leaf";
  id: FilterId;
  op: FilterOperatorId;
  value: FilterValue;
}

export interface FilterGroupNode {
  type: "group";
  op: FilterGroupOp;
  children: FilterNode[];
}

export type FilterNode = FilterLeafNode | FilterGroupNode;

/**
 * Narrow an unknown JSON value into a FilterNode if possible.
 * If you already have strong typing at the call site, you can skip this
 * and accept FilterNode directly.
 */
function asFilterNode(input: unknown): FilterNode | null {
  if (!input || typeof input !== "object") return null;
  const node = input as any;

  if (node.type === "leaf") {
    if (!node.id || !node.op) return null;
    return {
      type: "leaf",
      id: node.id as FilterId,
      op: node.op as FilterOperatorId,
      value: {
        value: node.value,
        values: node.values,
        from: node.from,
        to: node.to,
      },
    };
  }

  if (node.type === "group") {
    const op = node.op as FilterGroupOp;
    if (op !== "AND" && op !== "OR") return null;
    const rawChildren: unknown[] = Array.isArray(node.children)
      ? node.children
      : [];
    const children: FilterNode[] = [];

    for (const child of rawChildren) {
      const c = asFilterNode(child);
      if (c) children.push(c);
    }

    return {
      type: "group",
      op,
      children,
    };
  }

  return null;
}

/* ========================================================================== *
 * Core compilation
 * ========================================================================== */

/**
 * Compile a single leaf node into a Shopify search token, or null if:
 * - The filterId has no searchToken (FAST-only), or
 * - The particular (op, value) combination cannot be expressed.
 */
function compileLeafToToken(node: FilterLeafNode): string | null {
  const def = FILTER_SEARCH_REGISTRY[node.id];
  if (!def || !def.searchToken) return null;

  const token = def.searchToken({
    op: node.op,
    value: node.value,
  });

  if (!token || !token.trim()) return null;

  return token.trim();
}

/**
 * Compile a group node into a Shopify search expression. Children that cannot
 * be expressed return null and are skipped. If no children are expressible,
 * returns null.
 */
function compileGroupToToken(node: FilterGroupNode): string | null {
  const childTokens: string[] = [];

  for (const child of node.children) {
    const token = compileNodeToToken(child);
    if (token && token.trim().length > 0) {
      childTokens.push(token.trim());
    }
  }

  if (!childTokens.length) return null;
  if (childTokens.length === 1) return childTokens[0];

  const joiner = node.op === "AND" ? " AND " : " OR ";
  return `(${childTokens.join(joiner)})`;
}

function compileNodeToToken(node: FilterNode): string | null {
  if (node.type === "leaf") {
    return compileLeafToToken(node);
  }
  return compileGroupToToken(node);
}

/* ========================================================================== *
 * Public API
 * ========================================================================== */

/**
 * Compile filterJson (AST) into a Shopify products(query: "...") string.
 *
 * - Returns "" if filterJson is null/undefined, or nothing is expressible.
 * - DOES NOT throw on unsupported filters; it simply omits them.
 *   If you want to strictly gate BulkOps on full support, use
 *   isFilterSearchFullySupported() or isBulkOpsCompatible() below.
 */
export function compileFilterToShopifySearch(filterJson: unknown): string {
  if (!filterJson) return "";

  const root = asFilterNode(filterJson);
  if (!root) return "";

  const token = compileNodeToToken(root);
  return token ?? "";
}

/**
 * Check whether the filterJson *only* uses filters that support Shopify search.
 * This does NOT check value validity; it only checks filter IDs.
 */
export function isFilterSearchFullySupported(filterJson: unknown): boolean {
  if (!filterJson) return true;

  function walk(node: FilterNode): boolean {
    if (node.type === "leaf") {
      return filterSupportsShopifySearch(node.id);
    }
    return node.children.every(walk);
  }

  const root = asFilterNode(filterJson);
  if (!root) return true;

  return walk(root);
}

/**
 * Conservative helper for engine choice: BulkOps is safe only if:
 * - The scope is ALL or FILTERED, and
 * - The filter tree (if any) uses only filters that support Shopify search.
 */
export function isBulkOpsCompatibleFilter(filterJson: unknown): boolean {
  return isFilterSearchFullySupported(filterJson);
}
