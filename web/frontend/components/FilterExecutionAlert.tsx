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
  debug?: boolean;
}

export const FilterExecutionAlert: React.FC<FilterExecutionAlertProps> = ({
  mode,
  guardrail,
  warnings,
  astDepth,
  fastFiltersCount,
  debug = false,
}) => {
  const isNoop =
    mode === "FAST_ONLY" &&
    !guardrail?.limited &&
    warnings.length === 0 &&
    !debug;

  if (isNoop) return null;

  return (
    <Banner title={titleForMode(mode, guardrail)} tone={toneForMode(mode, guardrail)}>
      <BlockStack gap="100">
        <InlineStack gap="200" align="space-between" blockAlign="center">
          <InlineStack gap="200" blockAlign="center">
            <Badge>{modeLabel(mode)}</Badge>
            <Text as="span" variant="bodySm">
              {subtitleForMode(mode, guardrail)}
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
          <Text as="p" variant="bodySm" tone="subdued">
            Debug: AST depth {astDepth ?? "–"} • FAST leaves {fastFiltersCount ?? "–"}
            {guardrail
              ? ` • matched ${guardrail.totalMatched} • shown ${guardrail.shownCount} • pageSize ${guardrail.pageSize} • hasMore ${String(
                  guardrail.hasMore,
                )} • limited ${String(guardrail.limited)}`
              : ""}
          </Text>
        )}
      </BlockStack>
    </Banner>
  );
};

function formatNumber(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "0";
  return new Intl.NumberFormat().format(value);
}

function modeLabel(mode: FilterExecutionMode): string {
  if (mode === "FAST_ONLY") return "Fast search";
  return "Automatic";
}

function titleForMode(
  mode: FilterExecutionMode,
  guardrail: FilterGuardrailInfo | null,
): string {
  if (guardrail?.limited) {
    return "Showing a limited set of results";
  }

  if (mode === "FAST_ONLY") {
    return "Live search applied";
  }

  return "Filter applied";
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

  if (mode === "FAST_ONLY") {
    return "Results are calculated from the latest product data.";
  }

  return "Filters are applied automatically.";
}

function toneForMode(
  mode: FilterExecutionMode,
  guardrail: FilterGuardrailInfo | undefined | null,
): "info" | "success" | "warning" | "critical" {
  if (guardrail?.limited) return "warning";
  if (mode === "FAST_ONLY") return "success";
  return "info";
}