export function computeSnapshotTtl(args: {
  productCount: number;
  approxBytes: bigint;
}) {
  // Base TTL
  let ttlHours = 24;

  // Heavy snapshot heuristics
  if (args.productCount > 100_000) ttlHours = 72;
  if (args.productCount > 300_000) ttlHours = 120;

  if (args.approxBytes > 2n * 1024n ** 3n) ttlHours += 24; // +1 day
  if (args.approxBytes > 5n * 1024n ** 3n) ttlHours += 48;

  return ttlHours * 60 * 60 * 1000;
}
