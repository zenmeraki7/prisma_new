// FILE: web/frontend/components/SnapshotStatusCard.tsx

import React from "react";
import {
  Card,
  Text,
  InlineStack,
  BlockStack,
  Badge,
  ProgressBar,
  Tooltip,
} from "@shopify/polaris";
import type { FilterGuardrailInfo } from "../hooks/useProductsByFilter";

export type SnapshotRunState =
  | "QUEUED"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED";

export interface SnapshotStatus {
  id: string;
  state: SnapshotRunState;
  progress: number;      // rows processed
  total: number;         // estimated total rows
  createdAt: string;
  errorMessage?: string | null;
}

interface SnapshotStatusCardProps {
  run: SnapshotStatus | null;
  guardrail: FilterGuardrailInfo | null;
}

/**
 * SnapshotStatusCard
 *
 * Designed to sit above or below ProductGrid, near FilterExecutionAlert.
 * Shows:
 * - Snapshot state + progress bar
 * - Total rows vs processed
 * - Guardrail candidate info (candidateCount / limit)
 */
export const SnapshotStatusCard: React.FC<SnapshotStatusCardProps> = ({
  run,
  guardrail,
}) => {
  if (!run) return null;

  const {
    state,
    progress,
    total,
    createdAt,
    errorMessage,
  } = run;

  const percent =
    total > 0 ? Math.min(100, Math.round((progress / total) * 100)) : 0;

  const tone = stateToBadgeTone(state);
  const createdLabel = new Date(createdAt).toLocaleString();

  const guardrailText =
    guardrail &&
    `${guardrail.candidateCount}/${guardrail.candidateLimit} snapshot candidates${
      guardrail.candidateLimitHit ? " (limit hit – results may be partial)" : ""
    }`;

  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center">
          <InlineStack gap="200" blockAlign="center">
            <Text as="h2" variant="headingSm">
              Snapshot status
            </Text>
            <Badge tone={tone}>{stateLabel(state)}</Badge>
          </InlineStack>

          <Text as="span" variant="bodySm" tone="subdued">
            Created: {createdLabel}
          </Text>
        </InlineStack>

        <BlockStack gap="100">
          <InlineStack align="space-between" blockAlign="center">
            <Text as="span" variant="bodySm">
              Progress: {progress}/{total || "?"} rows
            </Text>
            <Text as="span" variant="bodySm" tone="subdued">
              {percent}% complete
            </Text>
          </InlineStack>
          <ProgressBar progress={percent} />
        </BlockStack>

        {guardrail && (
          <InlineStack align="space-between" blockAlign="center">
            <Text as="span" variant="bodySm">
              Guardrail:{" "}
              {guardrail.candidateLimitHit ? (
                <Tooltip content="The snapshot contains more candidates than the safe limit. Results may be partial or capped.">
                  <span>{guardrailText}</span>
                </Tooltip>
              ) : (
                guardrailText
              )}
            </Text>
          </InlineStack>
        )}

        {errorMessage && (
          <Text as="p" variant="bodySm" tone="critical">
            Error: {errorMessage}
          </Text>
        )}
      </BlockStack>
    </Card>
  );
};

function stateLabel(state: SnapshotRunState): string {
  switch (state) {
    case "QUEUED":
      return "Queued";
    case "RUNNING":
      return "Running";
    case "SUCCEEDED":
      return "Ready";
    case "FAILED":
      return "Failed";
    case "CANCELLED":
      return "Cancelled";
    default:
      return state;
  }
}

function stateToBadgeTone(
  state: SnapshotRunState,
): "critical" | "success" | "warning" | "new" | "attention" | "info" {
  switch (state) {
    case "SUCCEEDED":
      return "success";
    case "FAILED":
      return "critical";
    case "QUEUED":
      return "attention";
    case "RUNNING":
      return "info";
    case "CANCELLED":
      return "warning";
    default:
      return "info";
  }
}
