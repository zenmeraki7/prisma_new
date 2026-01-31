// web/frontend/lib/filters/buildFilterAST.ts
import type { AppliedFilter, StringOp, NumberOp, DateOp, EnumOp } from "./registry";

/**
 * Converts AppliedFilter[] to the JSON AST format expected by the backend
 */
export function buildFilterAST(filters: AppliedFilter[]): any {
  if (filters.length === 0) return null;

  // If single filter, return it directly
  if (filters.length === 1) {
    return convertFilterToAST(filters[0]);
  }

  // Multiple filters: combine with AND
  return {
    type: "group",  // Changed from "and" to "group"
    op: "and",      // Added op field
    children: filters.map(convertFilterToAST),
  };
}

function convertFilterToAST(filter: AppliedFilter): any {
  const { key, kind } = filter;

  switch (kind) {
    case "string":
      return convertStringFilter(key, filter.op, filter.value);
    
    case "number":
      return convertNumberFilter(key, filter.op, filter.value, filter.value2);
    
    case "date":
      return convertDateFilter(key, filter.op, filter.value);
    
    case "enum":
      return convertEnumFilter(key, filter.op, filter.value);
    
    case "boolean":
      return convertBooleanFilter(key, filter.value);
    
    default:
      console.warn(`Unknown filter kind: ${kind}`);
      return { filterId: key, op: "eq", value: "" };  // Fixed
  }
}

function convertStringFilter(filterId: string, op: StringOp, value: string): any {
  switch (op) {
    case "equals":
      return { filterId, op: "eq", value };
    
    case "notEquals":
      return { filterId, op: "neq", value };
    
    case "contains":
      return { filterId, op: "contains", value };
    
    case "notContains":
      return { filterId, op: "not_contains", value };  // Fixed: snake_case
    
    case "containsAny":
      // For multiple values, use "in" operator
      const words = value.split(/\s+/).filter(Boolean);
      return { filterId, op: "in", value: words };
    
    case "startsWith":
      return { filterId, op: "starts_with", value };  // Fixed: snake_case
    
    case "notStartsWith":
      // Use NOT group
      return {
        type: "group",
        op: "not",
        children: [{ filterId, op: "starts_with", value }]
      };
    
    case "endsWith":
      return { filterId, op: "ends_with", value };  // Fixed: snake_case
    
    case "containsCi":
      return { filterId, op: "contains", value };  // contains is case-insensitive by default
    
    case "equalsCi":
      return { filterId, op: "eq", value };  // eq is case-insensitive for strings
    
    default:
      console.warn(`Unknown string operator: ${op}`);
      return { filterId, op: "eq", value };
  }
}

function convertNumberFilter(
  filterId: string, 
  op: NumberOp, 
  value: number, 
  value2?: number
): any {
  switch (op) {
    case "eq":
      return { filterId, op: "eq", value };
    
    case "neq":
      return { filterId, op: "neq", value };
    
    case "gt":
      return { filterId, op: "gt", value };
    
    case "gte":
      return { filterId, op: "gte", value };
    
    case "lt":
      return { filterId, op: "lt", value };
    
    case "lte":
      return { filterId, op: "lte", value };
    
    case "between":
      if (value2 == null) {
        console.warn("between operator requires value2");
        return { filterId, op: "gte", value };
      }
      // Use the between operator directly
      return { 
        filterId, 
        op: "between", 
        value: [Math.min(value, value2), Math.max(value, value2)]
      };
    
    default:
      console.warn(`Unknown number operator: ${op}`);
      return { filterId, op: "eq", value };
  }
}

function convertDateFilter(filterId: string, op: DateOp, value: string): any {
  switch (op) {
    case "before":
      return { filterId, op: "lt", value };
    
    case "after":
      return { filterId, op: "gt", value };
    
    case "on":
      return { filterId, op: "eq", value };
    
    default:
      console.warn(`Unknown date operator: ${op}`);
      return { filterId, op: "eq", value };
  }
}

function convertEnumFilter(filterId: string, op: EnumOp, value: string): any {
  switch (op) {
    case "is":
      return { filterId, op: "eq", value };
    
    case "isNot":
      return { filterId, op: "neq", value };
    
    default:
      console.warn(`Unknown enum operator: ${op}`);
      return { filterId, op: "eq", value };
  }
}

function convertBooleanFilter(filterId: string, value: boolean): any {
  return { filterId, op: "eq", value };
}