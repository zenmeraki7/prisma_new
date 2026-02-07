import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AppBridgeState } from "@shopify/app-bridge-react";
import { graphqlRequest } from "../../lib/graphqlClient";

const SYNC_FAST_PLANE_MUTATION = /* GraphQL */ `
  mutation SyncFastPlane {
    syncFastPlane {
      enqueued
    }
  }
`;

export function useFastPlaneSync(app: AppBridgeState | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!app) {
        throw new Error("AppBridge not ready");
      }

      return graphqlRequest<{
        syncFastPlane: { enqueued: boolean };
      }>(app, SYNC_FAST_PLANE_MUTATION);
    },

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["fastPlaneStatus"],
      });
    },
  });
}
