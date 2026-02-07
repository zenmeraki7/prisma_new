export function isSupersetScope(
  snapshotScope: Record<string, any>,
  requestScope: Record<string, any>,
): boolean {
  for (const key of Object.keys(requestScope)) {
    const r = requestScope[key];
    const s = snapshotScope[key];

    if (s == null) continue;

    if (typeof r === "number" && typeof s === "number") {
      if (s > r) return false;
    } else if (s !== r) {
      return false;
    }
  }
  return true;
}
