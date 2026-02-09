// FILE: web/frontend/components/FilterPlanBanner.tsx

import React from "react";
import { Banner, Text, InlineStack, Badge, BlockStack } from "@shopify/polaris";
import type {
  FilterPlan,
  FilterGuardrailInfo,
  FilterExecutionMode,
} from "../hooks/useProductsByFilter";

interface FilterPlanBannerProps {
  plan: FilterPlan | null;
}

/**
 * Shows planner mode + AST stats + guardrail.
 * Designed to sit above your ProductGrid.
 */
export const FilterPlanBanner: React.FC<FilterPlanBannerProps> = ({ plan }) => {
  if (!plan) return null;

  const {
    mode,
    astDepth,
    fastFiltersCount,
    snapshotFiltersCount,
    guardrail,
    warnings,
  } = plan;

  const tone = modeToTone(mode, guardrail);

  return (
    <Banner title="Filter plan" tone={tone}>
      <BlockStack gap="100">
        <InlineStack gap="200" align="space-between" blockAlign="center">
          <InlineStack gap="200" blockAlign="center">
            <Badge>{modeLabel(mode)}</Badge>
            <Text as="span" variant="bodySm">
              AST depth: {astDepth} • FAST leaves: {fastFiltersCount} • SNAPSHOT
              leaves: {snapshotFiltersCount}
            </Text>
          </InlineStack>

          {guardrail && (
            <Text as="span" variant="bodySm">
              Guardrail: {guardrail.candidateCount}/{guardrail.candidateLimit} FAST
              candidates{" "}
              {guardrail.candidateLimitHit &&
                "(limit hit – results may be partial)"}
            </Text>
          )}
        </InlineStack>

        {warnings.length > 0 && (
          <BlockStack gap="050">
            {warnings.map((w, idx) => (
              <Text key={idx} as="p" variant="bodySm">
                • {w}
              </Text>
            ))}
          </BlockStack>
        )}
      </BlockStack>
    </Banner>
  );
};

function modeLabel(mode: FilterExecutionMode): string {
  switch (mode) {
    case "FAST_ONLY":
      return "FAST plane";
    case "SNAPSHOT_ONLY":
      return "SNAPSHOT plane";
    case "HYBRID":
      return "HYBRID (FAST + SNAPSHOT)";
    case "AUTO":
    default:
      return "AUTO (planned)";
  }
}

function modeToTone(
  mode: FilterExecutionMode,
  guardrail: FilterGuardrailInfo | undefined | null,
): "info" | "success" | "warning" | "critical" {
  if (mode === "HYBRID" && guardrail?.candidateLimitHit) {
    return "warning";
  }
  if (mode === "SNAPSHOT_ONLY") return "info";
  if (mode === "FAST_ONLY") return "success";
  return "info";
}
