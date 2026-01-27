// web/lib/filters/shopifySearchCompiler.ts
// (append these helpers to your existing file)

// ---------------------------------------------------------------------------
// Public helpers for BulkOps integration
// ---------------------------------------------------------------------------

/**
 * Simple wrapper used by the BulkOps export worker.
 * Takes the raw filterJson from ExportJob.filterJson and compiles it into a
 * Shopify products(query: "...") string.
 *
 * If the filter is null/unsupported, this returns an empty string (meaning
 * "no additional constraints" for BulkOps). DO NOT rely on this alone to
 * decide whether BulkOps is safe – use isBulkOpsCompatibleFilter() in your
 * engine chooser.
 */
export function compileFilterToShopifySearch(
  filterJson: unknown,
): string {
  const root = normalizeFilterNode(filterJson);
  if (!root) return "";
  const query = compileNode(root);
  return query.trim();
}

/**
 * Conservative compatibility check for BulkOps:
 *
 * Returns true iff the filterJson tree is *entirely* composed of node kinds
 * that this compiler understands, and every node normalizes successfully.
 *
 * If any node is of an unknown kind, or fails normalization, we treat the
 * whole tree as NOT BulkOps-compatible and should route that plan to FAST.
 */
export function isBulkOpsCompatibleFilter(
  filterJson: unknown,
): boolean {
  if (!filterJson) return true; // no filter → trivially compatible

  function isSupportedNode(raw: unknown): boolean {
    if (!raw || typeof raw !== "object") return false;
    const node = raw as any;

    switch (node.kind) {
      case "group": {
        if (node.op !== "and" && node.op !== "or") return false;
        const children = Array.isArray(node.children)
          ? node.children
          : [];
        if (!children.length) return false;
        return children.every(isSupportedNode);
      }

      // All leaf kinds we currently support:
      case "status":
      case "vendor":
      case "tags":
      case "productType":
      case "createdAt":
      case "updatedAt":
      case "title":
      case "handle":
      case "sku":
      case "inventoryQuantity":
      case "price": {
        // Reuse your normalization logic as the source of truth
        // for "is this node structurally OK?"
        return normalizeFilterNode(node) != null;
      }

      default:
        // Any unknown kind means the tree is not safe for BulkOps.
        return false;
    }
  }

  return isSupportedNode(filterJson);
}
