// web/lib/filters/astFromJson.ts
import type { FilterExpr } from "./dsl.js";

/**
 * Convert incoming JSON (from GraphQL JSON scalar) into a FilterExpr.
 * We trust the frontend to send a valid structure and only do light checks.
 */
export function astFromJson(raw: unknown): FilterExpr | null {
  if (!raw) return null;

  const node = raw as any;

  // Group node
  if (node.type === "group") {
    if (!Array.isArray(node.children)) {
      throw new Error("Filter group must have a children array");
    }
    return node as FilterExpr;
  }

  // Leaf node
  if (node.type === "leaf") {
    if (typeof node.filterId !== "string" || typeof node.op !== "string") {
      throw new Error("Filter leaf must have filterId and op");
    }
    return node as FilterExpr;
  }

  throw new Error("Unknown FilterExpr node type in JSON");
}
