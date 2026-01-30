import type { FilterExpr, FilterLeafExpr } from "./dsl.js";
import { getFieldDef } from "./registry.js";
import crypto from "crypto";

export type ExecutionMode = "FAST" | "SNAPSHOT" | "MIXED";

export type ExecutionPlan = {
  mode: ExecutionMode;
  planHash: string;
  fastFilters: FilterExpr | null;
  snapshotFilters: FilterExpr | null;
  reasons: string[];
};

export function planFilterExecution(expr: FilterExpr): ExecutionPlan {
  const fastLeaves: FilterLeafExpr[] = [];
  const snapshotLeaves: FilterLeafExpr[] = [];
  const reasons: string[] = [];

  walk(expr, (leaf) => {
    const def = getFieldDef(leaf.filterId);
    if (!def || !def.supportedNow) {
      snapshotLeaves.push(leaf);
      reasons.push(`${leaf.filterId} requires snapshot`);
    } else {
      fastLeaves.push(leaf);
    }
  });

  const mode: ExecutionMode =
    fastLeaves.length && snapshotLeaves.length
      ? "MIXED"
      : snapshotLeaves.length
      ? "SNAPSHOT"
      : "FAST";

  return {
    mode,
    planHash: hash(expr),
    fastFilters: fastLeaves.length ? expr : null,
    snapshotFilters: snapshotLeaves.length ? expr : null,
    reasons,
  };
}

function walk(expr: FilterExpr, visit: (l: FilterLeafExpr) => void) {
  if (expr.type === "leaf") {
    visit(expr);
  } else {
    expr.children.forEach((c) => walk(c, visit));
  }
}

function hash(expr: FilterExpr): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(expr))
    .digest("hex")
    .slice(0, 16);
}
