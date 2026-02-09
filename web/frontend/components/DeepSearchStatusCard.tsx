// FILE: web/frontend/components/DeepSearchStatusCard.tsx

import React from "react";
import { Card, Text, InlineStack, Badge, ProgressBar, BlockStack } from "@shopify/polaris";
import type { SnapshotStatus } from "../hooks/useSnapshotRunStatus";
import type { FilterGuardrailInfo } from "../hooks/useProductsByFilter";

interface DeepSearchStatusCardProps {
  run: SnapshotStatus | null;
  guardrail: FilterGuardrailInfo | null;
}

export const DeepSearchStatusCard: React.FC<DeepSearchStatusCardProps> = ({ run, guardrail }) => {
  if (!run) return null;

  const pct = run.total > 0 ? Math.round((run.progress / run.total) * 100) : 0;

  const tone: "success" | "critical" | "info" = 
    run.state === "FAILED" ? "critical" :
    run.state === "SUCCEEDED" ? "success" :
    "info";

  const badgeText =
    run.state === "RUNNING"
      ? "Preparing deeper results"
      : run.state === "SUCCEEDED"
      ? "Deeper results ready"
      : run.state === "FAILED"
      ? "Could not prepare deeper results"
      : "Queued";

  return (
    <Card sectioned>
      <BlockStack gap="200">
        <InlineStack gap="200" align="space-between" blockAlign="center">
          <InlineStack gap="200" blockAlign="center">
            <Badge tone={tone}>{badgeText}</Badge>
            <Text as="span" variant="bodySm">
              {run.state === "RUNNING" && `Processing ${run.progress} of ${run.total} products…`}
              {run.state === "SUCCEEDED" && `Processed ${run.total} products.`}
              {run.state === "FAILED" && (run.errorMessage || "Something went wrong preparing results.")}
            </Text>
          </InlineStack>

          {guardrail && guardrail.candidateLimitHit && (
            <Text as="span" variant="bodySm">
              Showing up to {guardrail.candidateLimit} fast matches. Deeper results are being prepared.
            </Text>
          )}
        </InlineStack>

        {run.state === "RUNNING" && (
          <ProgressBar progress={pct} size="small" />
        )}
      </BlockStack>
    </Card>
  );
};
