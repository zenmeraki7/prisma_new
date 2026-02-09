// FILE: web/scripts/generateFrontendFilters.ts
//
// Usage (from project root, adjust path as needed):
//   npx ts-node web/scripts/generateFrontendFilters.ts
//   or
//   npx tsx web/scripts/generateFrontendFilters.ts
//
// This script walks the backend FILTER_REGISTRY and emits a
// type-safe frontend config at:
//   web/frontend/config/FILTERS.ts
//
// Source of truth: web/lib/filters/registry.ts

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import {
  FILTER_REGISTRY,
  type FilterDefinition,
  type FilterKey,
  type FilterScope,
  type FilterPlane,
  type ValueKind,
  type FilterWidget,
  type FilterOperator,
} from "../lib/filters/registry";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface FrontendFilterConfigInternal {
  key: FilterKey;
  label: string;
  scope: FilterScope;
  plane: FilterPlane;
  valueKind: ValueKind;
  operators: FilterOperator[];
  widget: FilterWidget;
  placeholder?: string;
  multiSelect?: boolean;
  enumValues?: { value: string; label: string }[];
  fullText?: {
    vectorField: string;
    config?: string;
  };
}

function buildFrontendConfig(def: FilterDefinition): FrontendFilterConfigInternal {
  const { key, label, scope, valueKind, operators, db, enumValues, fullText, ui } =
    def;

  const widget: FilterWidget = ui?.widget ?? inferWidget(valueKind, enumValues);
  const placeholder = ui?.placeholder;
  const multiSelect =
    ui?.multiSelect ??
    inferMultiSelect(valueKind, operators, enumValues ?? undefined);

  return {
    key,
    label,
    scope,
    plane: db.plane,
    valueKind,
    operators,
    widget,
    placeholder,
    multiSelect,
    enumValues,
    fullText: fullText
      ? {
          vectorField: fullText.vectorField,
          config: fullText.config,
        }
      : undefined,
  };
}

function inferWidget(
  valueKind: ValueKind,
  enumValues?: { value: string; label: string }[],
): FilterWidget {
  if (enumValues && enumValues.length > 0) {
    return "select";
  }
  switch (valueKind) {
    case "boolean":
      return "boolean-toggle";
    case "number":
      return "number";
    case "date":
      return "date";
    case "text":
      return "textarea";
    case "string":
    case "enum":
    default:
      return "text";
  }
}

function inferMultiSelect(
  valueKind: ValueKind,
  operators: FilterOperator[],
  enumValues?: { value: string; label: string }[],
): boolean | undefined {
  // Heuristic:
  // - If filter supports IN/NOT_IN and is enum or string, it's often multi-select.
  const hasIn = operators.includes("IN") || operators.includes("NOT_IN");
  if (!hasIn) return undefined;

  if (valueKind === "enum" || valueKind === "string") {
    return true;
  }

  if (enumValues && enumValues.length > 0) {
    return true;
  }

  return undefined;
}

// Simple TS-safe literal formatter (no external deps, no full AST).
function formatString(value: string | undefined): string {
  if (value === undefined) return "undefined";
  return JSON.stringify(value); // handles quotes/escapes
}

function formatEnumValues(
  values: { value: string; label: string }[] | undefined,
): string {
  if (!values || values.length === 0) return "undefined";
  const inner = values
    .map(
      (v) =>
        `{ value: ${JSON.stringify(v.value)}, label: ${JSON.stringify(
          v.label,
        )} }`,
    )
    .join(", ");
  return `[${inner}]`;
}

function formatOperators(ops: FilterOperator[]): string {
  if (!ops || ops.length === 0) return "[]";
  return `[${ops.map((op) => JSON.stringify(op)).join(", ")}]`;
}

function formatFullText(
  fullText:
    | {
        vectorField: string;
        config?: string;
      }
    | undefined,
): string {
  if (!fullText) return "undefined";
  const parts = [`vectorField: ${JSON.stringify(fullText.vectorField)}`];
  if (fullText.config) {
    parts.push(`config: ${JSON.stringify(fullText.config)}`);
  }
  return `{ ${parts.join(", ")} }`;
}

// ---------------------------------------------------------------------------
// Main generation
// ---------------------------------------------------------------------------

function generate(): void {
  const outPath = path.resolve(
    __dirname,
    "../frontend/config/FILTERS.ts",
  );

  const entries: FrontendFilterConfigInternal[] = Object.keys(
    FILTER_REGISTRY,
  ).map((key) => {
    const def = FILTER_REGISTRY[key as FilterKey];
    return buildFrontendConfig(def);
  });

  // Sort for deterministic output (nice for diffs)
  entries.sort((a, b) => a.key.localeCompare(b.key));

  const fileHeader = `// FILE: web/frontend/config/FILTERS.ts
//
// GENERATED FILE – DO NOT EDIT BY HAND
// Source of truth: web/lib/filters/registry.ts
//
// To regenerate:
//   npx ts-node web/scripts/generateFrontendFilters.ts
//   or
//   npx tsx web/scripts/generateFrontendFilters.ts

import type {
  FilterKey,
  FilterOperator,
  FilterScope,
  ValueKind,
  FilterWidget,
  FilterPlane,
} from "../../lib/filters/registry";

export interface FrontendFilterConfig {
  key: FilterKey;
  label: string;
  scope: FilterScope;
  plane: FilterPlane;
  valueKind: ValueKind;
  operators: FilterOperator[];
  widget: FilterWidget;
  placeholder?: string;
  multiSelect?: boolean;
  enumValues?: { value: string; label: string }[];
  fullText?: {
    vectorField: string;
    config?: string;
  };
}

export const FILTERS: FrontendFilterConfig[] = [
`;

  const fileFooter = `
];
`;

  const body = entries
    .map((cfg) => {
      return `  {
    key: ${JSON.stringify(cfg.key)},
    label: ${JSON.stringify(cfg.label)},
    scope: ${JSON.stringify(cfg.scope)},
    plane: ${JSON.stringify(cfg.plane)},
    valueKind: ${JSON.stringify(cfg.valueKind)},
    operators: ${formatOperators(cfg.operators)},
    widget: ${JSON.stringify(cfg.widget)},
    placeholder: ${formatString(cfg.placeholder)},
    multiSelect: ${
      cfg.multiSelect === undefined ? "undefined" : cfg.multiSelect
    },
    enumValues: ${formatEnumValues(cfg.enumValues)},
    fullText: ${formatFullText(cfg.fullText)},
  }`;
    })
    .join(",\n");

  const output = fileHeader + body + fileFooter;

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, output, { encoding: "utf8" });

  // eslint-disable-next-line no-console
  console.log(
    `[generateFrontendFilters] Wrote ${entries.length} filters → ${outPath}`,
  );
}

generate();
