// web/graphql/filtering/filterInputMapper.ts

import {
  type AppliedFilter,
  type StringOp,
  type NumberOp,
  type DateOp,
  type EnumOp,
  type BooleanOp,
} from "../../lib/filters/registry";

/**
 * These types mirror your GraphQL SDL enums/inputs on the TypeScript side.
 * They are written as string literal unions so you don't need codegen to
 * get good type-safety.
 */

/* ---------------------------------- */
/* GraphQL enum mirrors               */
/* ---------------------------------- */

export type GqlFilterKind = "STRING" | "NUMBER" | "DATE" | "ENUM" | "BOOLEAN";

export type GqlFilterFieldKey =
  // Product fields
  | "PRODUCT_CATEGORY"
  | "PRODUCT_COLLECTION"
  | "PRODUCT_CREATED_AT"
  | "PRODUCT_PUBLISHED_AT"
  | "PRODUCT_UPDATED_AT"
  | "PRODUCT_DESCRIPTION"
  | "PRODUCT_HANDLE"
  | "PRODUCT_INVENTORY_QUANTITY"
  | "PRODUCT_OPTION1_NAME"
  | "PRODUCT_OPTION2_NAME"
  | "PRODUCT_OPTION3_NAME"
  | "PRODUCT_ID"
  | "PRODUCT_PRODUCT_TYPE"
  | "PRODUCT_SEO_VISIBILITY"
  | "PRODUCT_STATUS"
  | "PRODUCT_TAG"
  | "PRODUCT_THEME_TEMPLATE"
  | "PRODUCT_TITLE"
  | "PRODUCT_VARIANT_COUNT"
  | "PRODUCT_VENDOR"
  | "PRODUCT_VISIBLE_ONLINE_STORE"
  | "PRODUCT_VISIBLE_POS"
  // Variant fields
  | "VARIANT_BARCODE"
  | "VARIANT_CHARGE_TAX"
  | "VARIANT_COMPARE_AT_PRICE"
  | "VARIANT_CONNECTED_INVENTORY_LOCATION"
  | "VARIANT_COST"
  | "VARIANT_COUNTRY_OF_ORIGIN"
  | "VARIANT_HS_TARIFF_CODE"
  | "VARIANT_OUT_OF_STOCK_POLICY"
  | "VARIANT_OPTION1_VALUE"
  | "VARIANT_OPTION2_VALUE"
  | "VARIANT_OPTION3_VALUE"
  | "VARIANT_PHYSICAL_PRODUCT"
  | "VARIANT_PRICE"
  | "VARIANT_PROFIT_MARGIN"
  | "VARIANT_SKU"
  | "VARIANT_TRACK_QUANTITY"
  | "VARIANT_INVENTORY_QUANTITY"
  | "VARIANT_TITLE"
  | "VARIANT_WEIGHT"
  | "VARIANT_WEIGHT_UNIT";

export type GqlStringFilterOp =
  | "EQUALS"
  | "NOT_EQUALS"
  | "CONTAINS"
  | "NOT_CONTAINS"
  | "CONTAINS_ANY"
  | "ENDS_WITH"
  | "STARTS_WITH"
  | "NOT_STARTS_WITH"
  | "CONTAINS_CI"
  | "EQUALS_CI";

export type GqlNumberFilterOp =
  | "EQ"
  | "NEQ"
  | "GT"
  | "GTE"
  | "LT"
  | "LTE"
  | "BETWEEN";

export type GqlDateFilterOp = "BEFORE" | "AFTER" | "ON";

export type GqlEnumFilterOp = "IS" | "IS_NOT";

export type GqlBooleanFilterOp = "IS";

export type GqlFilterLogicalOp = "AND" | "OR";

/* ---------------------------------- */
/* GraphQL input mirrors              */
/* ---------------------------------- */

export interface StringFilterBodyInput {
  op: GqlStringFilterOp;
  value: string;
}

export interface NumberFilterBodyInput {
  op: GqlNumberFilterOp;
  value: number;
  value2?: number | null;
}

export interface DateFilterBodyInput {
  op: GqlDateFilterOp;
  /**
   * yyyy-mm-dd
   */
  value: string;
}

export interface EnumFilterBodyInput {
  op: GqlEnumFilterOp;
  value: string;
}

export interface BooleanFilterBodyInput {
  op: GqlBooleanFilterOp;
  value: boolean;
}

export interface FilterClauseInput {
  field: GqlFilterFieldKey;
  kind: GqlFilterKind;

  string?: StringFilterBodyInput | null;
  number?: NumberFilterBodyInput | null;
  date?: DateFilterBodyInput | null;
  enum?: EnumFilterBodyInput | null;
  boolean?: BooleanFilterBodyInput | null;
}

export interface FilterGroupInput {
  op: GqlFilterLogicalOp;
  clauses?: FilterClauseInput[] | null;
  groups?: FilterGroupInput[] | null;
}

export interface PlanFiltersInput {
  root?: FilterGroupInput | null;
}

/* ---------------------------------- */
/* Internal AST for planners           */
/* ---------------------------------- */

export interface FilterGroupAst {
  op: GqlFilterLogicalOp;
  clauses: AppliedFilter[];
  groups: FilterGroupAst[];
}

/* ---------------------------------- */
/* Mapping helpers                     */
/* ---------------------------------- */

/**
 * Map GraphQL field enum -> registry key string, e.g.
 *   PRODUCT_TITLE -> "product.title"
 *   VARIANT_PRICE -> "variant.price"
 */
export function mapFieldKeyToRegistryKey(field: GqlFilterFieldKey): string {
  switch (field) {
    // Product fields
    case "PRODUCT_CATEGORY":
      return "product.category";
    case "PRODUCT_COLLECTION":
      return "product.collection";
    case "PRODUCT_CREATED_AT":
      return "product.createdAt";
    case "PRODUCT_PUBLISHED_AT":
      return "product.publishedAt";
    case "PRODUCT_UPDATED_AT":
      return "product.updatedAt";
    case "PRODUCT_DESCRIPTION":
      return "product.description";
    case "PRODUCT_HANDLE":
      return "product.handle";
    case "PRODUCT_INVENTORY_QUANTITY":
      return "product.inventoryQuantity";
    case "PRODUCT_OPTION1_NAME":
      return "product.option1Name";
    case "PRODUCT_OPTION2_NAME":
      return "product.option2Name";
    case "PRODUCT_OPTION3_NAME":
      return "product.option3Name";
    case "PRODUCT_ID":
      return "product.id";
    case "PRODUCT_PRODUCT_TYPE":
      return "product.productType";
    case "PRODUCT_SEO_VISIBILITY":
      return "product.seoVisibility";
    case "PRODUCT_STATUS":
      return "product.status";
    case "PRODUCT_TAG":
      return "product.tag";
    case "PRODUCT_THEME_TEMPLATE":
      return "product.themeTemplate";
    case "PRODUCT_TITLE":
      return "product.title";
    case "PRODUCT_VARIANT_COUNT":
      return "product.variantCount";
    case "PRODUCT_VENDOR":
      return "product.vendor";
    case "PRODUCT_VISIBLE_ONLINE_STORE":
      return "product.visibleOnlineStore";
    case "PRODUCT_VISIBLE_POS":
      return "product.visiblePOS";

    // Variant fields
    case "VARIANT_BARCODE":
      return "variant.barcode";
    case "VARIANT_CHARGE_TAX":
      return "variant.chargeTax";
    case "VARIANT_COMPARE_AT_PRICE":
      return "variant.compareAtPrice";
    case "VARIANT_CONNECTED_INVENTORY_LOCATION":
      return "variant.connectedInventoryLocation";
    case "VARIANT_COST":
      return "variant.cost";
    case "VARIANT_COUNTRY_OF_ORIGIN":
      return "variant.countryOfOrigin";
    case "VARIANT_HS_TARIFF_CODE":
      return "variant.hsTariffCode";
    case "VARIANT_OUT_OF_STOCK_POLICY":
      return "variant.outOfStockPolicy";
    case "VARIANT_OPTION1_VALUE":
      return "variant.option1Value";
    case "VARIANT_OPTION2_VALUE":
      return "variant.option2Value";
    case "VARIANT_OPTION3_VALUE":
      return "variant.option3Value";
    case "VARIANT_PHYSICAL_PRODUCT":
      return "variant.physicalProduct";
    case "VARIANT_PRICE":
      return "variant.price";
    case "VARIANT_PROFIT_MARGIN":
      return "variant.profitMargin";
    case "VARIANT_SKU":
      return "variant.sku";
    case "VARIANT_TRACK_QUANTITY":
      return "variant.trackQuantity";
    case "VARIANT_INVENTORY_QUANTITY":
      return "variant.inventoryQuantity";
    case "VARIANT_TITLE":
      return "variant.title";
    case "VARIANT_WEIGHT":
      return "variant.weight";
    case "VARIANT_WEIGHT_UNIT":
      return "variant.weightUnit";
  }
}

/**
 * GraphQL → TS StringOp
 */
function mapStringOp(op: GqlStringFilterOp): StringOp {
  switch (op) {
    case "EQUALS":
      return "equals";
    case "NOT_EQUALS":
      return "notEquals";
    case "CONTAINS":
      return "contains";
    case "NOT_CONTAINS":
      return "notContains";
    case "CONTAINS_ANY":
      return "containsAny";
    case "ENDS_WITH":
      return "endsWith";
    case "STARTS_WITH":
      return "startsWith";
    case "NOT_STARTS_WITH":
      return "notStartsWith";
    case "CONTAINS_CI":
      return "containsCi";
    case "EQUALS_CI":
      return "equalsCi";
  }
}

function mapNumberOp(op: GqlNumberFilterOp): NumberOp {
  switch (op) {
    case "EQ":
      return "eq";
    case "NEQ":
      return "neq";
    case "GT":
      return "gt";
    case "GTE":
      return "gte";
    case "LT":
      return "lt";
    case "LTE":
      return "lte";
    case "BETWEEN":
      return "between";
  }
}

function mapDateOp(op: GqlDateFilterOp): DateOp {
  switch (op) {
    case "BEFORE":
      return "before";
    case "AFTER":
      return "after";
    case "ON":
      return "on";
  }
}

function mapEnumOp(op: GqlEnumFilterOp): EnumOp {
  switch (op) {
    case "IS":
      return "is";
    case "IS_NOT":
      return "isNot";
  }
}

function mapBooleanOp(op: GqlBooleanFilterOp): BooleanOp {
  switch (op) {
    case "IS":
      return "is";
  }
}

/* ---------------------------------- */
/* Clause → AppliedFilter             */
/* ---------------------------------- */

/**
 * Convert a single FilterClauseInput into your TS AppliedFilter union.
 * Throws if the body doesn't match the declared kind.
 */
export function mapFilterClauseToAppliedFilter(
  clause: FilterClauseInput,
): AppliedFilter {
  const key = mapFieldKeyToRegistryKey(clause.field);

  switch (clause.kind) {
    case "STRING": {
      const body = clause.string;
      if (!body) {
        throw new Error('STRING kind requires "string" body');
      }
      return {
        key,
        kind: "string",
        op: mapStringOp(body.op),
        value: body.value,
      };
    }

    case "NUMBER": {
      const body = clause.number;
      if (!body) {
        throw new Error('NUMBER kind requires "number" body');
      }
      if (body.op === "BETWEEN") {
        if (body.value2 == null) {
          throw new Error('BETWEEN operator requires "value2"');
        }
        return {
          key,
          kind: "number",
          op: mapNumberOp(body.op),
          value: body.value,
          value2: body.value2,
        };
      }
      return {
        key,
        kind: "number",
        op: mapNumberOp(body.op),
        value: body.value,
      };
    }

    case "DATE": {
      const body = clause.date;
      if (!body) {
        throw new Error('DATE kind requires "date" body');
      }
      return {
        key,
        kind: "date",
        op: mapDateOp(body.op),
        value: body.value,
      };
    }

    case "ENUM": {
      const body = clause.enum;
      if (!body) {
        throw new Error('ENUM kind requires "enum" body');
      }
      return {
        key,
        kind: "enum",
        op: mapEnumOp(body.op),
        value: body.value,
      };
    }

    case "BOOLEAN": {
      const body = clause.boolean;
      if (!body) {
        throw new Error('BOOLEAN kind requires "boolean" body');
      }
      return {
        key,
        kind: "boolean",
        op: mapBooleanOp(body.op),
        value: body.value,
      };
    }
  }
}

/* ---------------------------------- */
/* Group tree → FilterGroupAst        */
/* ---------------------------------- */

export function mapFilterGroupInputToAst(
  group: FilterGroupInput,
): FilterGroupAst {
  const clauses = (group.clauses ?? []).map(mapFilterClauseToAppliedFilter);
  const groups = (group.groups ?? []).map(mapFilterGroupInputToAst);

  return {
    op: group.op,
    clauses,
    groups,
  };
}

/**
 * Top-level helper: GraphQL PlanFiltersInput → internal FilterGroupAst.
 * Returns null if there is no root or it has neither clauses nor groups.
 */
export function mapPlanFiltersInputToAst(
  input?: PlanFiltersInput | null,
): FilterGroupAst | null {
  const root = input?.root;
  if (!root) return null;

  const ast = mapFilterGroupInputToAst(root);
  const hasContent =
    ast.clauses.length > 0 || ast.groups.some((g) => g.clauses.length > 0 || g.groups.length > 0);

  if (!hasContent) return null;
  return ast;
}
