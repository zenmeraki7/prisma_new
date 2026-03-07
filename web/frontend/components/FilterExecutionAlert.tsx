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

  astDepth?: number | null;
  fastFiltersCount?: number | null;
  snapshotFiltersCount?: number | null;

  debug?: boolean;
}

export const FilterExecutionAlert: React.FC<FilterExecutionAlertProps> = ({
  mode,
  guardrail,
  warnings,
  astDepth,
  fastFiltersCount,
  snapshotFiltersCount,
  debug = false,
}) => {
  const normalizedMode = normalizeDisplayMode(mode);
  const tone = modeToTone(normalizedMode, guardrail);

  const isNoop =
    normalizedMode === "FAST_ONLY" &&
    !guardrail?.limited &&
    warnings.length === 0 &&
    !debug;

  if (isNoop) return null;

  return (
    <Banner title={titleForMode(normalizedMode, guardrail)} tone={tone}>
      <BlockStack gap="100">
        <InlineStack gap="200" align="space-between" blockAlign="center">
          <InlineStack gap="200" blockAlign="center">
            <Badge>{modeLabel(normalizedMode)}</Badge>
            <Text as="span" variant="bodySm">
              {subtitleForMode(normalizedMode, guardrail)}
            </Text>
          </InlineStack>

          {guardrail && (
            <Text as="span" variant="bodySm">
              {guardrail.limited
                ? `Matching products: ${formatNumber(
                    guardrail.totalMatched,
                  )} — showing ${formatNumber(guardrail.shownCount)}`
                : `Matching products: ${formatNumber(guardrail.totalMatched)}`}
            </Text>
          )}
        </InlineStack>

        {warnings.length > 0 && (
          <BlockStack gap="050">
            {warnings.map((warning, index) => (
              <Text key={index} as="p" variant="bodySm">
                • {warning}
              </Text>
            ))}
          </BlockStack>
        )}

        {debug && (
          <BlockStack gap="050">
            <Text as="p" variant="bodySm" tone="subdued">
              Debug: AST depth {astDepth ?? "–"} • FAST leaves{" "}
              {fastFiltersCount ?? "–"} • OTHER leaves{" "}
              {snapshotFiltersCount ?? "–"}
              {guardrail
                ? ` • matched ${guardrail.totalMatched} • shown ${guardrail.shownCount} • pageSize ${guardrail.pageSize} • hasMore ${String(
                    guardrail.hasMore,
                  )} • limited ${String(guardrail.limited)}`
                : ""}
            </Text>
          </BlockStack>
        )}
      </BlockStack>
    </Banner>
  );
};

function normalizeDisplayMode(mode: FilterExecutionMode): FilterExecutionMode {
  if (mode === "SNAPSHOT_ONLY") return "AUTO";
  return mode;
}

function formatNumber(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "0";
  return new Intl.NumberFormat().format(value);
}

function modeLabel(mode: FilterExecutionMode): string {
  switch (mode) {
    case "FAST_ONLY":
      return "Fast search";
    case "HYBRID":
      return "Advanced search";
    case "AUTO":
      return "Automatic";
    case "SNAPSHOT_ONLY":
    default:
      return "Automatic";
  }
}

function titleForMode(
  mode: FilterExecutionMode,
  guardrail: FilterGuardrailInfo | null,
): string {
  if (guardrail?.limited) {
    return "Showing a limited set of results";
  }

  switch (mode) {
    case "FAST_ONLY":
      return "Live search applied";
    case "HYBRID":
      return "Advanced search applied";
    case "AUTO":
      return "Filter applied";
    case "SNAPSHOT_ONLY":
    default:
      return "Filter applied";
  }
}

function subtitleForMode(
  mode: FilterExecutionMode,
  guardrail: FilterGuardrailInfo | null,
): string {
  if (guardrail?.limited) {
    return `Your filters match many products. For performance, we’re showing ${formatNumber(
      guardrail.shownCount,
    )} of ${formatNumber(guardrail.totalMatched)} matching products.`;
  }

  switch (mode) {
    case "FAST_ONLY":
      return "Results are calculated from the latest product data.";
    case "HYBRID":
      return "Some filters require a broader search strategy for accurate results.";
    case "AUTO":
      return "Filters are applied automatically based on performance and accuracy.";
    case "SNAPSHOT_ONLY":
    default:
      return "Filters are applied automatically based on performance and accuracy.";
  }
}

function modeToTone(
  mode: FilterExecutionMode,
  guardrail: FilterGuardrailInfo | undefined | null,
): "info" | "success" | "warning" | "critical" {
  if (guardrail?.limited) {
    return "warning";
  }

  if (mode === "FAST_ONLY") return "success";
  if (mode === "HYBRID" || mode === "AUTO") return "info";
  return "info";
}