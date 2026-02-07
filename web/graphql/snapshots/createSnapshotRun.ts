const TTL_BY_STATE: Record<string, number> = {
  QUEUED: 6 * 60 * 60 * 1000,
  SUCCEEDED: 24 * 60 * 60 * 1000,
  FAILED: 24 * 60 * 60 * 1000,
  CANCELLED: 6 * 60 * 60 * 1000,
};

export function computeExpiresAt(state: string) {
  const ttl = TTL_BY_STATE[state];
  if (!ttl) throw new Error(`No TTL for state ${state}`);
  return new Date(Date.now() + ttl);
}
