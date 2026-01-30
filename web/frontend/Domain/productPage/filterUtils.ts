// web/frontend/pages/productsPage/filterUtils.ts
import type { ProductLiteDto } from "../../queries/bootstrapProducts";
import type {
  AppliedFilter,
  StringOp,
  NumberOp,
  DateOp,
  EnumOp,
} from "./filterTypes";
import { fieldSupportedNow } from "./filterRegistry";

/* ----------------------- */
/* Labels (for tag display)*/
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
/* Client-side evaluation  */
/* ----------------------- */

function normalizeStr(v: string | null | undefined): string {
  return (v ?? "").toString();
}

function applyStringOp(input: string, op: StringOp, needle: string): boolean {
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

function applyNumberOp(
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

function applyDateOp(inputIso: string | null | undefined, op: DateOp, dateYmd: string): boolean {
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

function applyEnumOp(input: string | null | undefined, op: EnumOp, value: string): boolean {
  const v = normalizeStr(input);
  if (!value) return true;
  if (op === "is") return v === value;
  return v !== value;
}

function applyBooleanOp(input: boolean | null | undefined, value: boolean): boolean {
  if (input == null) return true; // if we don't have data yet, don't filter
  return input === value;
}

function getProductFieldValue(product: ProductLiteDto, key: string): unknown {
  // Only map what exists in ProductLiteDto today.
  switch (key) {
    case "product.title":
      return product.title ?? "";
    case "product.vendor":
      return product.vendor ?? "";
    case "product.productType":
      return product.productType ?? "";
    case "product.status":
      return product.status ?? "";
    case "product.handle":
      return product.handle ?? "";
    case "product.tag":
      return product.tags ?? [];
    case "product.updatedAt":
      return product.updatedAtShopify ?? null;
    default:
      return undefined; // unknown/not in FAST-plane DTO yet
  }
}

export function filterPredicate(product: ProductLiteDto, f: AppliedFilter): boolean {
  // If this field isn't supported yet (no data), we do NOT filter out rows.
  const supported = fieldSupportedNow(f.key);
  if (!supported) return true;

  const raw = getProductFieldValue(product, f.key);

  switch (f.kind) {
    case "string": {
      if (f.key === "product.tag") {
        const tags = Array.isArray(raw) ? (raw as string[]) : [];
        // treat "contains" etc. as matching any tag
        const joined = tags.join(" ");
        return applyStringOp(joined, f.op, f.value);
      }
      return applyStringOp(typeof raw === "string" ? raw : String(raw ?? ""), f.op, f.value);
    }
    case "number":
      return applyNumberOp(
        typeof raw === "number" ? raw : (raw as number | null | undefined),
        f.op,
        f.value,
        f.value2,
      );
    case "date":
      return applyDateOp(typeof raw === "string" ? raw : (raw as string | null | undefined), f.op, f.value);
    case "enum":
      return applyEnumOp(typeof raw === "string" ? raw : String(raw ?? ""), f.op, f.value);
    case "boolean":
      return applyBooleanOp(typeof raw === "boolean" ? raw : (raw as boolean | null | undefined), f.value);
    default:
      return true;
  }
}
