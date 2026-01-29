// web/frontend/components/products/FastStatusCard.tsx

import React from "react";
import { Card, Box, InlineStack, Badge, Text } from "@shopify/polaris";
import type { BootstrapStatusDto } from "../../queries/bootstrapProducts";

export interface FastStatusCardProps {
  fastStatus: BootstrapStatusDto | undefined;
}

export function FastStatusCard({ fastStatus }: FastStatusCardProps) {
  return (
    <Card>
      <Box padding="400">
        {fastStatus ? (
          <InlineStack gap="400" align="space-between" blockAlign="center">
            <InlineStack gap="200" blockAlign="center">
              <Badge tone={fastStatus.fastReady ? "success" : "critical"}>
                {`FAST ${fastStatus.fastReady ? "ready" : "not ready"}`}
              </Badge>

              <Text as="span" variant="bodySm" tone="subdued">
                Rev {fastStatus.fastRevision}
              </Text>

              {fastStatus.fastLastSyncAt && (
                <Text as="span" variant="bodySm" tone="subdued">
                  Last sync: {new Date(fastStatus.fastLastSyncAt).toLocaleString()}
                </Text>
              )}
            </InlineStack>

            {fastStatus.syncEnqueued && <Badge tone="attention">Sync enqueued</Badge>}
          </InlineStack>
        ) : (
          <Text as="p" variant="bodySm" tone="subdued">
            Loading FAST sync status…
          </Text>
        )}
      </Box>
    </Card>
  );
}
