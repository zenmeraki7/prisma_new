import type { PlanExplainReason, PlannedProductQuery } from "./types";
import { FILTER_REGISTRY } from "../../lib/filters/registry";

function collectExplainReasons(
  filter: FilterExpr | null,
  sort?: { field: string },
): PlanExplainReason[] {
  const reasons: PlanExplainReason[] = [];
  if (!filter) return reasons;

  for (const node of filter.flatten()) {
    const def = FILTER_REGISTRY[node.filterId];
    if (!def) continue;

    if (def.plane === "SNAPSHOT") {
      reasons.push({
        code: "UNSUPPORTED_FAST_FILTER",
        filterId: node.filterId,
      });
    }

    if (def.scope === "variant") {
      reasons.push({
        code: "VARIANT_LEVEL_FILTER",
        filterId: node.filterId,
      });
    }

    if (def.db?.fullText) {
      reasons.push({
        code: "FULL_TEXT_SEARCH",
        filterId: node.filterId,
      });
    }
  }

  if (sort && !FILTER_REGISTRY[`product.${sort.field}`]?.db?.indexed) {
    reasons.push({
      code: "SORT_NOT_INDEXED",
      field: sort.field,
    });
  }

  return reasons;
}
