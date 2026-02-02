// web/types/filters.ts

/**
 * A single predicate coming from the UI / API.
 * Example:
 * { key: "product.title", operator: "CONTAINS", value: "shoe" }
 */
export type ApiFilterPayload = {
  key: string;
  operator: string;
  value: any;
};

/**
 * Optional wrapper shape if your GraphQL input expects:
 * filter: { predicates: [...] }
 */
export type ApiFilterInput = {
  predicates: ApiFilterPayload[];
};

/**
 * Generic operator union.
 * Extend freely as your registry grows.
 */
export type FilterOperator =
  | "EQUALS"
  | "NOT_EQUALS"
  | "CONTAINS"
  | "NOT_CONTAINS"
  | "STARTS_WITH"
  | "ENDS_WITH"
  | "IN"
  | "NOT_IN"
  | "GT"
  | "GTE"
  | "LT"
  | "LTE"
  | "BETWEEN"
  | "IS_EMPTY"
  | "IS_NOT_EMPTY"
  | "TRUE"
  | "FALSE";

/**
 * UI state representation of a filter row.
 * Used by FilterBar / useFilterBuilder hook.
 */
export type ActiveFilter = {
  id: string; // uuid or nanoid
  key: string;
  operator: FilterOperator;
  value: any;
};

/**
 * Helpful for dropdown options in UI.
 */
export type SelectOption = {
  label: string;
  value: string;
};

/**
 * Registry-side UI metadata (optional but useful).
 */
export type FilterUIConfig = {
  widget?: "text" | "number" | "date" | "boolean-toggle";
  placeholder?: string;
};

/**
 * Definition shape if you want strong typing in registry.ts
 */
export type FilterDefinition = {
  key: string;
  label: string;
  operators: FilterOperator[];
  enumValues?: SelectOption[];
  ui?: FilterUIConfig;
};
