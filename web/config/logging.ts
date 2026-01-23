// web/config/logging.ts
export function logInfo(message: string, meta?: unknown) {
  // You can replace with pino/winston later
  // eslint-disable-next-line no-console
  console.log("[INFO]", message, meta ?? "");
}

export function logError(message: string, meta?: unknown) {
  // eslint-disable-next-line no-console
  console.error("[ERROR]", message, meta ?? "");
}
