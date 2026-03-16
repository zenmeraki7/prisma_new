// FILE: frontend/components/BulkEditPresetList.tsx

import { useState } from "react";
import {
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Divider,
  InlineStack,
  Text,
} from "@shopify/polaris";
import {
  deleteBulkEditPreset,
  getBulkEditFieldLabel,
  getBulkEditScopeLabel,
  runBulkEditPreset,
  type BulkEditPreset,
} from "../../../frontend/lib/bulkEdit/bulkEditApi";

interface BulkEditPresetListProps {
  presets: BulkEditPreset[];
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  onRunStarted?: (jobId: string) => void;
}

export default function BulkEditPresetList({
  presets,
  loading = false,
  error = null,
  onRefresh,
  onRunStarted,
}: BulkEditPresetListProps) {
  const [busyId, setBusyId] = useState<string | null>(null);

  const handleRun = async (presetId: string) => {
    try {
      setBusyId(presetId);
      const response = await runBulkEditPreset(presetId);
      onRunStarted?.(response.job.id);
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (presetId: string) => {
    try {
      setBusyId(presetId);
      await deleteBulkEditPreset(presetId);
      onRefresh?.();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between">
          <Text as="h2" variant="headingMd">
            Saved bulk edit presets
          </Text>
          {onRefresh ? <Button onClick={onRefresh}>Refresh</Button> : null}
        </InlineStack>

        {error ? (
          <Banner tone="critical">
            <p>{error}</p>
          </Banner>
        ) : null}

        {!loading && presets.length === 0 ? (
          <Text as="p" tone="subdued">
            No presets saved yet.
          </Text>
        ) : null}

        <BlockStack gap="0">
          {presets.map((preset, index) => (
            <Box key={preset.id}>
              {index > 0 ? <Divider /> : null}
              <Box padding="400">
                <InlineStack align="space-between" blockAlign="start">
                  <BlockStack gap="100">
                    <InlineStack gap="200">
                      <Text as="h3" variant="headingSm">
                        {preset.name}
                      </Text>
                      {preset.isFavorite ? (
                        <Text as="span" tone="success">
                          ★ Favorite
                        </Text>
                      ) : null}
                    </InlineStack>

                    {preset.description ? (
                      <Text as="p" tone="subdued">
                        {preset.description}
                      </Text>
                    ) : null}

                    <Text as="p" variant="bodySm" tone="subdued">
                      {getBulkEditScopeLabel(preset.scope)} · {getBulkEditFieldLabel(preset.fieldKey)}
                    </Text>
                  </BlockStack>

                  <InlineStack gap="200">
                    <Button
                      variant="primary"
                      onClick={() => handleRun(preset.id)}
                      loading={busyId === preset.id}
                    >
                      Run
                    </Button>
                    <Button
                      tone="critical"
                      onClick={() => handleDelete(preset.id)}
                      disabled={busyId === preset.id}
                    >
                      Archive
                    </Button>
                  </InlineStack>
                </InlineStack>
              </Box>
            </Box>
          ))}
        </BlockStack>
      </BlockStack>
    </Card>
  );
}