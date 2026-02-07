export function extractPlanScope(filter: FilterExpr | null) {
  const scope: Record<string, unknown> = {};

  if (!filter) return scope;

  for (const node of filter.flatten()) {
    if (!["eq", "gte", "lte"].includes(node.op)) continue;
    if (node.kind === "or") return null;

    scope[node.filterId] = node.value;
  }

  return scope;
}
