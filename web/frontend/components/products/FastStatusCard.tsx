// web/frontend/components/products/FastStatusCard.tsx

import React from "react";
import { Card, Box, InlineStack, BlockStack, Badge, Text } from "@shopify/polaris";
import type { BootstrapStatusDto } from "../../queries/bootstrapProducts";

export interface FastStatusCardProps {
  fastStatus: BootstrapStatusDto | undefined;
  hasVariantFilters?: boolean;
  snapshotEmpty?: boolean;
}

export function FastStatusCard({
  fastStatus,
  hasVariantFilters = false,
  snapshotEmpty = false,
}: FastStatusCardProps) {
  return (
    <Card>
      <Box padding="400">
        {!fastStatus ? (
          <Text as="p" variant="bodySm" tone="subdued">
            Loading FAST sync status…
          </Text>
        ) : (
          <BlockStack gap="300">
            {/* ─────────────────────────────
               Top status row
            ───────────────────────────── */}
            <InlineStack align="space-between" blockAlign="center">
              <InlineStack gap="200" blockAlign="center">
                <Badge tone={fastStatus.fastReady ? "success" : "critical"}>
                  FAST {fastStatus.fastReady ? "ready" : "not ready"}
                </Badge>

                <Text as="span" variant="bodySm" tone="subdued">
                  Rev {fastStatus.fastRevision}
                </Text>
              </InlineStack>

              {fastStatus.syncEnqueued && (
                <Badge tone="attention">Sync in progress</Badge>
              )}
            </InlineStack>

            {/* ─────────────────────────────
               Meta info row
            ───────────────────────────── */}
            {fastStatus.fastLastSyncAt && (
              <Text as="p" variant="bodySm" tone="subdued">
                Last synced on{" "}
                {new Date(fastStatus.fastLastSyncAt).toLocaleString()}
              </Text>
            )}

            {/* ─────────────────────────────
               Preview / snapshot context
            ───────────────────────────── */}
            {hasVariantFilters && (
              <Box
                background="bg-surface-secondary"
                padding="300"
                borderRadius="200"
              >
                <BlockStack gap="150">
                  <InlineStack gap="200" blockAlign="center">
                    <Badge tone="attention">Preview mode</Badge>
                    {snapshotEmpty && (
                      <Badge tone="warning">Snapshot not ready</Badge>
                    )}
                  </InlineStack>

                  <Text as="p" variant="bodySm" tone="subdued">
                    Variant-based filters use snapshot data. FAST preview may
                    show extra products until syncing completes.
                  </Text>

                  {snapshotEmpty && (
                    <Text as="p" variant="bodySm" tone="subdued">
                      No matching products found in snapshot yet. This usually
                      resolves after the initial sync.
                    </Text>
                  )}
                </BlockStack>
              </Box>
            )}
          </BlockStack>
        )}
      </Box>
    </Card>
  );
}
