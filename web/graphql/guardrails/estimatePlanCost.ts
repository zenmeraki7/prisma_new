export function estimatePlanCost(plan: {
  mode: "FAST" | "SNAPSHOT";
  estimatedRows: number;
}) {
  if (plan.mode === "FAST" && plan.estimatedRows > 100_000) {
    return {
      allowed: false,
      reason: "FAST queries over 100k rows are blocked",
    };
  }

  if (plan.mode === "SNAPSHOT" && plan.estimatedRows > 1_000_000) {
    return {
      allowed: false,
      reason: "Snapshot exceeds maximum allowed size",
    };
  }

  return { allowed: true };
}
