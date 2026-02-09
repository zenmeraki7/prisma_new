// FILE: web/frontend/components/FilterExecutionAlert.tsx

import React from "react";
import {
  Banner,
  Text,
  InlineStack,
  Badge,
  BlockStack,
} from "@shopify/polaris";
import type {
  FilterExecutionMode,
  FilterGuardrailInfo,
} from "../hooks/useProductsByFilter";

interface FilterExecutionAlertProps {
  mode: FilterExecutionMode;
  guardrail: FilterGuardrailInfo | null;
  warnings: string[];

  // Optional debug-only stats
  astDepth?: number | null;
  fastFiltersCount?: number | null;
  snapshotFiltersCount?: number | null;

  // When true, show developer-level details.
  debug?: boolean;
}

/**
 * Merchant-facing execution notice with optional dev diagnostics.
 *
 * Example copy for merchants:
 * - "Showing results from snapshot analysis"
 * - "Large filter – results may be partial"
 */
export const FilterExecutionAlert: React.FC<FilterExecutionAlertProps> = ({
  mode,
  guardrail,
  warnings,
  astDepth,
  fastFiltersCount,
  snapshotFiltersCount,
  debug = false,
}) => {
  const tone = modeToTone(mode, guardrail);

  // If we’re in FAST_ONLY and no guardrail issue, we can be quiet.
  const isNoop =
    mode === "FAST_ONLY" &&
    !guardrail?.candidateLimitHit &&
    warnings.length === 0 &&
    !debug;

  if (isNoop) return null;

  return (
    <Banner title={titleForMode(mode, guardrail)} tone={tone}>
      <BlockStack gap="100">
        {/* Merchant-friendly headline row */}
        <InlineStack gap="200" align="space-between" blockAlign="center">
          <InlineStack gap="200" blockAlign="center">
            <Badge>{modeLabel(mode)}</Badge>
            <Text as="span" variant="bodySm">
              {subtitleForMode(mode, guardrail)}
            </Text>
          </InlineStack>

          {guardrail && (
            <Text as="span" variant="bodySm">
              Matching products: {guardrail.candidateCount}
              {` / `}
              {guardrail.candidateLimit}
              {guardrail.candidateLimitHit &&
                " – showing a limited set of results"}
            </Text>
          )}
        </InlineStack>

        {/* Optional merchant-visible warnings */}
        {warnings.length > 0 && (
          <BlockStack gap="050">
            {warnings.map((w, idx) => (
              <Text key={idx} as="p" variant="bodySm">
                • {w}
              </Text>
            ))}
          </BlockStack>
        )}

        {/* Debug diagnostics for you / support, not for merchants */}
        {debug && (
          <BlockStack gap="050">
            <Text as="p" variant="bodySm" tone="subdued">
              Debug: AST depth{" "}
              {astDepth ?? "–"} • FAST leaves{" "}
              {fastFiltersCount ?? "–"} • SNAPSHOT leaves{" "}
              {snapshotFiltersCount ?? "–"}
            </Text>
          </BlockStack>
        )}
      </BlockStack>
    </Banner>
  );
};

function modeLabel(mode: FilterExecutionMode): string {
  switch (mode) {
    case "FAST_ONLY":
      return "Fast search";
    case "SNAPSHOT_ONLY":
      return "Snapshot search";
    case "HYBRID":
      return "Hybrid search";
    case "AUTO":
    default:
      return "Automatic";
  }
}

function titleForMode(
  mode: FilterExecutionMode,
  guardrail: FilterGuardrailInfo | null,
): string {
  if (guardrail?.candidateLimitHit) {
    return "Showing a limited set of results";
  }
  switch (mode) {
    case "FAST_ONLY":
      return "Live search applied";
    case "SNAPSHOT_ONLY":
      return "Snapshot-based search applied";
    case "HYBRID":
      return "Combined search applied";
    case "AUTO":
    default:
      return "Filter applied";
  }
}

function subtitleForMode(
  mode: FilterExecutionMode,
  guardrail: FilterGuardrailInfo | null,
): string {
  if (guardrail?.candidateLimitHit) {
    return "Your filters match many products. For performance, we’re showing a limited subset.";
  }

  switch (mode) {
    case "FAST_ONLY":
      return "Results are calculated from the latest product data.";
    case "SNAPSHOT_ONLY":
      return "Results are taken from a saved snapshot. Some very recent changes might not be included.";
    case "HYBRID":
      return "Some filters use a saved snapshot, others are calculated live.";
    case "AUTO":
    default:
      return "Filters are applied automatically based on performance and accuracy.";
  }
}

function modeToTone(
  mode: FilterExecutionMode,
  guardrail: FilterGuardrailInfo | undefined | null,
): "info" | "success" | "warning" | "critical" {
  if (guardrail?.candidateLimitHit) {
    return "warning";
  }
  if (mode === "FAST_ONLY") return "success";
  if (mode === "SNAPSHOT_ONLY" || mode === "HYBRID") return "info";
  return "info";
}
