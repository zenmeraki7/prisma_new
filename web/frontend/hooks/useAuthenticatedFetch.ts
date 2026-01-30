// web/frontend/hooks/useAuthenticatedFetch.ts
import { useMemo } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticatedFetch } from "@shopify/app-bridge-utils";

export function useAuthenticatedFetch() {
  const app = useAppBridge();
  
  const fetch = useMemo(() => {
    return authenticatedFetch(app);
  }, [app]);
  
  return fetch;
}