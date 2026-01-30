import { authenticatedFetch } from "@shopify/app-bridge-utils";
import type { AppBridgeState } from "@shopify/app-bridge-react";

export function shopifyFetch(app: AppBridgeState) {
  return authenticatedFetch(app);
}
