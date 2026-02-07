import { FILTER_REGISTRY } from "../lib/filters/registry";
import fs from "fs";

const output = Object.values(FILTER_REGISTRY).map((f) => ({
  key: f.key,
  label: f.label,
  scope: f.scope,
  valueKind: f.valueKind,
  operators: f.operators,
  ui: f.ui,
}));

fs.writeFileSync(
  "web/frontend/filters/FILTERS.ts",
  `export const FILTERS = ${JSON.stringify(output, null, 2)};`,
);
