// web/frontend/pages/productsPage/filterTypes.ts

export type FilterKind = "string" | "number" | "date" | "enum" | "boolean";

export type StringOp =
  | "equals"
  | "notEquals"
  | "contains"
  | "notContains"
  | "containsAny"
  | "endsWith"
  | "startsWith"
  | "notStartsWith"
  | "containsCi"
  | "equalsCi";

export type NumberOp = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "between";
export type DateOp = "before" | "after" | "on";
export type EnumOp = "is" | "isNot";
export type BooleanOp = "is";

export type FieldDef = {
  key: string;
  label: string;
  group: "product" | "variant";
  kind: FilterKind;
  /**
   * FAST-plane support right now (client-side filtering works only for supported keys).
   * You can keep all the fields in UI, but only some will actually filter until data exists.
   */
  supportedNow: boolean;
};

export type AppliedFilter =
  | { key: string; kind: "string"; op: StringOp; value: string }
  | { key: string; kind: "number"; op: NumberOp; value: number; value2?: number }
  | { key: string; kind: "date"; op: DateOp; value: string } // yyyy-mm-dd
  | { key: string; kind: "enum"; op: EnumOp; value: string }
  | { key: string; kind: "boolean"; op: BooleanOp; value: boolean };
