// web/frontend/lib/filters/registry.ts

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
  /**
   * Logical group, e.g. "product", "variant", "order", "customer".
   */
  group: string;
  kind: FilterKind;
  /**
   * Whether this field is actually backed by data in the current plane (FAST, snapshot, etc.).
   * If false/undefined, UI can show a warning and evaluation can no-op.
   */
  supportedNow?: boolean;
};

export type AppliedFilter =
  | { key: string; kind: "string"; op: StringOp; value: string }
  | { key: string; kind: "number"; op: NumberOp; value: number; value2?: number }
  | { key: string; kind: "date"; op: DateOp; value: string } // yyyy-mm-dd
  | { key: string; kind: "enum"; op: EnumOp; value: string }
  | { key: string; kind: "boolean"; op: BooleanOp; value: boolean };

export interface FilterFieldGroup {
  id: string;
  label: string;
  fields: FieldDef[];
}

/* ----------------------- */
/* Operator label helpers  */
/* ----------------------- */

export function stringOpLabel(op: StringOp): string {
  switch (op) {
    case "equals":
      return "Equals";
    case "notEquals":
      return "Not Equals";
    case "contains":
      return "Contains";
    case "notContains":
      return "Does not contain";
    case "containsAny":
      return "Contains any of the words";
    case "endsWith":
      return "Ends with";
    case "startsWith":
      return "Starts with";
    case "notStartsWith":
      return "Does not start with";
    case "containsCi":
      return "Contains (case insensitive)";
    case "equalsCi":
      return "Equals (case insensitive)";
    default:
      return op;
  }
}

export function numberOpLabel(op: NumberOp): string {
  switch (op) {
    case "eq":
      return "Equals";
    case "neq":
      return "Not equals";
    case "gt":
      return "Greater than";
    case "gte":
      return "Greater than or equal";
    case "lt":
      return "Less than";
    case "lte":
      return "Less than or equal";
    case "between":
      return "Between";
    default:
      return op;
  }
}

export function dateOpLabel(op: DateOp): string {
  switch (op) {
    case "before":
      return "Is before";
    case "after":
      return "Is after";
    case "on":
      return "Is on";
    default:
      return op;
  }
}

export function enumOpLabel(op: EnumOp): string {
  return op === "is" ? "Is" : "Is not";
}

/* ----------------------- */
/* Core evaluation helpers */
/* ----------------------- */

function normalizeStr(v: string | null | undefined): string {
  return (v ?? "").toString();
}

export function applyStringOp(input: string, op: StringOp, needle: string): boolean {
  const value = normalizeStr(input);
  const term = normalizeStr(needle);
  const trimmed = term.trim();
  if (!trimmed) return true;

  switch (op) {
    case "equals":
      return value === term;
    case "notEquals":
      return value !== term;
    case "contains":
      return value.includes(term);
    case "notContains":
      return !value.includes(term);
    case "containsAny": {
      const words = term.split(/\s+/).filter(Boolean);
      if (!words.length) return true;
      const lower = value.toLowerCase();
      return words.some((w) => lower.includes(w.toLowerCase()));
    }
    case "startsWith":
      return value.startsWith(term);
    case "notStartsWith":
      return !value.startsWith(term);
    case "endsWith":
      return value.endsWith(term);
    case "containsCi":
      return value.toLowerCase().includes(term.toLowerCase());
    case "equalsCi":
      return value.toLowerCase() === term.toLowerCase();
    default:
      return true;
  }
}

export function applyNumberOp(
  input: number | null | undefined,
  op: NumberOp,
  a: number,
  b?: number,
): boolean {
  if (input == null || Number.isNaN(input)) return true; // if we don't have data yet, don't filter
  switch (op) {
    case "eq":
      return input === a;
    case "neq":
      return input !== a;
    case "gt":
      return input > a;
    case "gte":
      return input >= a;
    case "lt":
      return input < a;
    case "lte":
      return input <= a;
    case "between":
      if (b == null || Number.isNaN(b)) return true;
      return input >= Math.min(a, b) && input <= Math.max(a, b);
    default:
      return true;
  }
}

export function applyDateOp(
  inputIso: string | null | undefined,
  op: DateOp,
  dateYmd: string,
): boolean {
  if (!inputIso) return true; // if we don't have data yet, don't filter
  const inputDate = new Date(inputIso);
  if (Number.isNaN(inputDate.getTime())) return true;

  const selected = new Date(dateYmd);
  if (Number.isNaN(selected.getTime())) return true;

  // compare at day granularity
  const inY = inputDate.getFullYear();
  const inM = inputDate.getMonth();
  const inD = inputDate.getDate();

  const sY = selected.getFullYear();
  const sM = selected.getMonth();
  const sD = selected.getDate();

  const inputDay = new Date(inY, inM, inD).getTime();
  const selectedDay = new Date(sY, sM, sD).getTime();

  if (op === "on") return inputDay === selectedDay;
  if (op === "before") return inputDay < selectedDay;
  if (op === "after") return inputDay > selectedDay;
  return true;
}

export function applyEnumOp(
  input: string | null | undefined,
  op: EnumOp,
  value: string,
): boolean {
  const v = normalizeStr(input);
  if (!value) return true;
  if (op === "is") return v === value;
  return v !== value;
}

export function applyBooleanOp(
  input: boolean | null | undefined,
  value: boolean,
): boolean {
  if (input == null) return true; // if we don't have data yet, don't filter
  return input === value;
}
