export function buildStringCondition(f: any) {
  switch (f.op) {
    case "contains":
      return { contains: f.value, mode: "insensitive" };
    case "equals":
      return { equals: f.value };
    case "startsWith":
      return { startsWith: f.value };
    case "endsWith":
      return { endsWith: f.value };
    default:
      throw new Error(`Unsupported string op: ${f.op}`);
  }
}

export function buildNumberCondition(f: any) {
  switch (f.op) {
    case "eq":
      return { equals: Number(f.value) };
    case "gt":
      return { gt: Number(f.value) };
    case "gte":
      return { gte: Number(f.value) };
    case "lt":
      return { lt: Number(f.value) };
    case "lte":
      return { lte: Number(f.value) };
    case "between":
      return {
        gte: Number(f.value),
        lte: Number(f.value2),
      };
    default:
      throw new Error(`Unsupported number op: ${f.op}`);
  }
}
