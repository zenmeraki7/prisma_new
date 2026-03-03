// FILE: web/graphql/resolvers/productFilter.resolvers.js
//
// Resolvers for all product/variant filter queries.
//
// Architecture:
//   GraphQL resolver  →  productFilterService.pg.js  →  PostgreSQL
//
// Context shape expected:
//   context.shopId   – resolved from Shopify session / JWT (never trusted from client)
//   context.db       – pg Pool or PoolClient
//   context.logger   – structured logger (pino / winston compatible)

import {
  buildProductListQuery,
  buildProductCountQuery,
  buildVariantListQuery,
  buildVariantCountQuery,
  buildPresetFilterGroup,
  SORT_DEFS,
  PRESET_KEYS,
} from "../../services/productService/productFilterService.pg.js";

import {
  REGISTRY_BY_KEY,
  ALL_OP_KEYS,
  PRODUCT_OP_KEYS,
  VARIANT_OP_KEYS,
} from "../../services/productService/filterRegistry.server.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants (must stay in sync with service + schema defaults)
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_PAGE      = 1;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE     = 250;
const MAX_FILTER_DEPTH  = 8;   // keep in sync with productFilterService.pg.js

// Human-readable preset metadata — drives the UI preset picker
const PRESET_META = Object.freeze({
  [PRESET_KEYS.LOW_INVENTORY_VARIANT]: {
    label:       "Low Inventory (Variant)",
    description: "Variants with tracked inventory below the threshold",
  },
  [PRESET_KEYS.LOW_INVENTORY_PRODUCT]: {
    label:       "Low Inventory (Product)",
    description: "Active products whose total inventory is below the threshold",
  },
  [PRESET_KEYS.NO_SEO_VISIBILITY_HIDDEN]: {
    label:       "Hidden from Search Engines",
    description: "Active products with SEO visibility disabled",
  },
  [PRESET_KEYS.MISSING_IMAGES]: {
    label:       "Missing Images",
    description: "Products with zero images uploaded",
  },
  [PRESET_KEYS.NO_SKU]: {
    label:       "Missing SKU",
    description: "Variants with no SKU set",
  },
  [PRESET_KEYS.NO_BARCODE]: {
    label:       "Missing Barcode",
    description: "Variants with no barcode (UPC / ISBN / GTIN) set",
  },
  [PRESET_KEYS.DRAFT_PRODUCTS]: {
    label:       "Draft Products",
    description: "All products in draft status",
  },
  [PRESET_KEYS.ARCHIVED_PRODUCTS]: {
    label:       "Archived Products",
    description: "All products in archived status",
  },
  [PRESET_KEYS.OUT_OF_STOCK]: {
    label:       "Out of Stock",
    description: "Active products with zero total inventory",
  },
  [PRESET_KEYS.HIGH_COMPARE_AT_DISCOUNT]: {
    label:       "High Discount (Compare-at)",
    description: "Variants on sale where discount meets the threshold %",
  },
  [PRESET_KEYS.MISSING_COST]: {
    label:       "Missing Cost",
    description: "Variants with no cost / COGS set",
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve and validate pagination args into safe integers.
 * Matches PaginationInput defaults in schema.
 */
function resolvePagination(paginationArg) {
  const raw = paginationArg ?? {};

  const page =
    Number.isInteger(raw.page) && raw.page >= 1
      ? raw.page
      : DEFAULT_PAGE;

  const pageSize =
    Number.isInteger(raw.pageSize) && raw.pageSize >= 1
      ? Math.min(raw.pageSize, MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;

  return { page, pageSize };
}

/**
 * Build a PageInfo object from query results.
 */
function buildPageInfo({ page, pageSize, totalCount }) {
  const totalPages = Math.ceil(totalCount / pageSize) || 1;
  return {
    page,
    pageSize,
    totalCount,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}

/**
 * Normalise the GraphQL FilterGroupInput into the internal DSL shape.
 *
 * GraphQL FilterGroupInput supports:
 *   - operator: "AND" | "OR"
 *   - conditions: FilterConditionInput[]
 *   - groups: FilterGroupInput[]    (nested)
 *
 * Service DSL uses:
 *   - operator: "AND" | "OR"
 *   - conditions: Array<FilterCondition | FilterGroup>
 *
 * We merge `groups` into `conditions` here so the downstream service only
 * handles a single `conditions` array.
 *
 * @param {object|null} filterGroupInput
 * @returns {object|null}  internal FilterGroup DSL
 */
function normaliseFilterGroup(filterGroupInput) {
  if (!filterGroupInput) return null;

  const { operator, conditions = [], groups = [] } = filterGroupInput;

  const normalisedConditions = [
    ...(conditions ?? []),
    ...(groups ?? []).map(normaliseFilterGroup).filter(Boolean),
  ];

  if (normalisedConditions.length === 0) return null;

  return {
    operator: operator === "OR" ? "OR" : "AND",
    conditions: normalisedConditions,
  };
}

/**
 * Validate a filter group DSL tree, collecting all errors.
 *
 * IMPORTANT:
 * - This validator expects the *GraphQL* shape (with both `conditions` and `groups`),
 *   not the already-normalised internal DSL.
 *
 * Returns { valid: boolean, errors: [{path, message}] }.
 *
 * @param {object|null} group
 * @param {string}      path    dot-path for error reporting (e.g. "conditions[0]")
 * @param {number}      depth
 * @returns {{ valid: boolean, errors: Array<{path:string, message:string}> }}
 */
function validateFilterGroupInternal(group, path = "root", depth = 0) {
  const errors = [];

  if (!group) return { valid: true, errors };

  if (depth > MAX_FILTER_DEPTH) {
    errors.push({
      path,
      message: `Filter nesting exceeds max depth of ${MAX_FILTER_DEPTH}`,
    });
    return { valid: false, errors };
  }

  const { operator, conditions = [], groups = [] } = group;

  if (operator !== "AND" && operator !== "OR") {
    errors.push({
      path: `${path}.operator`,
      message: `operator must be AND or OR, got "${operator}"`,
    });
  }

  conditions.forEach((cond, i) => {
    const condPath = `${path}.conditions[${i}]`;

    if (!cond || typeof cond !== "object") {
      errors.push({ path: condPath, message: "condition must be an object" });
      return;
    }

    if (!cond.key) {
      errors.push({ path: `${condPath}.key`, message: "key is required" });
      return;
    }

    const def = REGISTRY_BY_KEY[cond.key];
    if (!def) {
      errors.push({
        path: `${condPath}.key`,
        message: `Unknown filter key "${cond.key}"`,
      });
      return;
    }

    if (!cond.operator) {
      errors.push({
        path: `${condPath}.operator`,
        message: "operator is required",
      });
      return;
    }

    if (!def.operators.includes(cond.operator)) {
      errors.push({
        path: `${condPath}.operator`,
        message: `Operator "${cond.operator}" is not allowed for key "${cond.key}". Allowed: ${def.operators.join(", ")}`,
      });
    }

    // ENUM value validation
    if (def.valueType === "ENUM" && def.enumValues) {
      const candidateValues = Array.isArray(cond.value) ? cond.value : [cond.value];
      const nonNull = candidateValues.filter((v) => v != null);
      const invalid = nonNull.filter((v) => !def.enumValues.includes(v));

      if (invalid.length > 0) {
        errors.push({
          path: `${condPath}.value`,
          message: `Invalid enum value(s) [${invalid.join(", ")}] for key "${cond.key}". Allowed: ${def.enumValues.join(", ")}`,
        });
      }
    }

    // BETWEEN requires a 2-element array
    if (cond.operator === "BETWEEN") {
      if (!Array.isArray(cond.value) || cond.value.length !== 2) {
        errors.push({
          path: `${condPath}.value`,
          message: `BETWEEN requires a 2-element array [from, to], got ${JSON.stringify(cond.value)}`,
        });
      }
    }

    // IN / NOT_IN require an array
    if ((cond.operator === "IN" || cond.operator === "NOT_IN") && !Array.isArray(cond.value)) {
      errors.push({
        path: `${condPath}.value`,
        message: `${cond.operator} requires an array value`,
      });
    }
  });

  // Recurse into nested groups
  groups.forEach((g, i) => {
    const nested = validateFilterGroupInternal(g, `${path}.groups[${i}]`, depth + 1);
    errors.push(...nested.errors);
  });

  return { valid: errors.length === 0, errors };
}

/**
 * Run both list and count queries in parallel and return the combined result.
 *
 * @param {object} db         – pg Pool/PoolClient
 * @param {object} logger
 * @param {object} listQuery  – { text, values }
 * @param {object} countQuery – { text, values }
 * @param {object} pagination – { page, pageSize }
 * @returns {Promise<{pageInfo, items}>}
 */
async function runPagedQuery(db, logger, listQuery, countQuery, pagination) {
  let listResult;
  let countResult;

  try {
    [listResult, countResult] = await Promise.all([
      db.query(listQuery.text, listQuery.values),
      db.query(countQuery.text, countQuery.values),
    ]);
  } catch (err) {
    logger.error({ err, listQuery, countQuery }, "runPagedQuery: DB query failed");
    throw new Error("Database query failed. Please try again.");
  }

  const totalCount = Number(countResult.rows[0]?.total_count ?? 0);
  const pageInfo   = buildPageInfo({ ...pagination, totalCount });

  return { pageInfo, items: listResult.rows };
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolver map
// ─────────────────────────────────────────────────────────────────────────────

export const productFilterResolvers = {
  Query: {
    /**
     * filteredProducts(
     *   filter:    FilterGroupInput
     *   sort:      SortKey         = CREATED_AT
     *   direction: SortDirection   = DESC
     *   pagination: PaginationInput
     * ): ProductConnection!
     */
    filteredProducts: async (_parent, args, context) => {
      const { shopId, db, logger } = context;
      assertShopId(shopId);

      const { filter, sort, direction, pagination: paginationArg } = args;

      const pagination   = resolvePagination(paginationArg);
      const filterConfig = normaliseFilterGroup(filter);

      const params = {
        shopId,
        filterConfig,
        sortKey:       sort      ?? "CREATED_AT",
        sortDirection: direction ?? "DESC",
        ...pagination,
      };

      const listQuery  = buildProductListQuery(params);
      const countQuery = buildProductCountQuery(params);

      return runPagedQuery(db, logger, listQuery, countQuery, pagination);
    },

    /**
     * filteredVariants(
     *   filter:    FilterGroupInput
     *   sort:      SortKey         = CREATED_AT
     *   direction: SortDirection   = DESC
     *   pagination: PaginationInput
     * ): VariantConnection!
     */
    filteredVariants: async (_parent, args, context) => {
      const { shopId, db, logger } = context;
      assertShopId(shopId);

      const { filter, sort, direction, pagination: paginationArg } = args;

      const pagination   = resolvePagination(paginationArg);
      const filterConfig = normaliseFilterGroup(filter);

      const params = {
        shopId,
        filterConfig,
        sortKey:       sort      ?? "CREATED_AT",
        sortDirection: direction ?? "DESC",
        ...pagination,
      };

      const listQuery  = buildVariantListQuery(params);
      const countQuery = buildVariantCountQuery(params);

      return runPagedQuery(db, logger, listQuery, countQuery, pagination);
    },

    /**
     * presetProducts(
     *   preset:    PresetKey!
     *   threshold: Int
     *   pagination: PaginationInput
     * ): ProductConnection!
     */
    presetProducts: async (_parent, args, context) => {
      const { shopId, db, logger } = context;
      assertShopId(shopId);

      const { preset, threshold, pagination: paginationArg } = args;
      const pagination = resolvePagination(paginationArg);

      let filterConfig;
      try {
        filterConfig = buildPresetFilterGroup(preset, { threshold });
      } catch (_err) {
        throw new Error(`Invalid preset: "${preset}"`);
      }

      const params = {
        shopId,
        filterConfig,
        sortKey:       "CREATED_AT",
        sortDirection: "DESC",
        ...pagination,
      };

      const listQuery  = buildProductListQuery(params);
      const countQuery = buildProductCountQuery(params);

      return runPagedQuery(db, logger, listQuery, countQuery, pagination);
    },

    /**
     * presetVariants(
     *   preset:    PresetKey!
     *   threshold: Int
     *   pagination: PaginationInput
     * ): VariantConnection!
     */
    presetVariants: async (_parent, args, context) => {
      const { shopId, db, logger } = context;
      assertShopId(shopId);

      const { preset, threshold, pagination: paginationArg } = args;
      const pagination = resolvePagination(paginationArg);

      let filterConfig;
      try {
        filterConfig = buildPresetFilterGroup(preset, { threshold });
      } catch (_err) {
        throw new Error(`Invalid preset: "${preset}"`);
      }

      const params = {
        shopId,
        filterConfig,
        sortKey:       "CREATED_AT",
        sortDirection: "DESC",
        ...pagination,
      };

      const listQuery  = buildVariantListQuery(params);
      const countQuery = buildVariantCountQuery(params);

      return runPagedQuery(db, logger, listQuery, countQuery, pagination);
    },

    /**
     * validateFilterGroup(
     *   filter: FilterGroupInput!
     * ): FilterValidationResult!
     */
    validateFilterGroup: (_parent, args) => {
      const { filter } = args;
      // Validate the raw GraphQL shape (conditions + groups)
      return validateFilterGroupInternal(filter);
    },

    /**
     * filterRegistry: FilterRegistryPayload!
     *
     * Drives the UI filter-builder; mirrors filterRegistry.server.js
     */
    filterRegistry: () => {
      const toDefinition = (key) => {
        const e = REGISTRY_BY_KEY[key];
        if (!e) return null;
        return {
          key:        e.key,
          label:      e.label,
          level:      e.level,      // "PRODUCT" | "VARIANT" -> FilterLevel enum
          valueType:  e.valueType,  // "STRING" | "NUMBER" | ... -> FilterValueType enum
          operators:  [...e.operators],
          sortable:   e.sortable   ?? false,
          isComputed: e.isComputed ?? false,
          enumValues: e.enumValues ? [...e.enumValues] : null,
        };
      };

      return {
        productFilters: PRODUCT_OP_KEYS.map(toDefinition).filter(Boolean),
        variantFilters: VARIANT_OP_KEYS.map(toDefinition).filter(Boolean),
        allFilters:     ALL_OP_KEYS.map(toDefinition).filter(Boolean),
      };
    },

    /**
     * sortDefinitions: [SortDefinition!]!
     *
     * Mirrors SORT_DEFS; SortDefinition.key is String, but the client
     * will typically treat it as the SortKey enum values.
     */
    sortDefinitions: () => {
      return Object.values(SORT_DEFS).map((def) => ({
        key:                 def.key,
        defaultDirection:    def.defaultDirection, // "ASC" | "DESC" -> SortDirection enum
        requiresVariantJoin: def.requiresVariantJoin ?? false,
      }));
    },

    /**
     * presetDefinitions: [PresetDefinition!]!
     */
    presetDefinitions: () => {
      return Object.values(PRESET_KEYS).map((key) => {
        const meta = PRESET_META[key] ?? { label: key, description: "" };
        return { key, label: meta.label, description: meta.description };
      });
    },
  },

  // ─────────────────────────────────────────────────────────
  // Field resolvers — camelCase mapping from snake_case DB rows
  // ─────────────────────────────────────────────────────────

  ProductRow: {
    id:                 (row) => String(row.id),
    shopId:             (row) => row.shop_id,
    shopifyProductId:   (row) => String(row.shopify_product_id),
    title:              (row) => row.title,
    handle:             (row) => row.handle,
    vendor:             (row) => row.vendor ?? null,
    status:             (row) => row.status,
    createdAt:          (row) => row.created_at,
    publishedAt:        (row) => row.published_at ?? null,
    updatedAt:          (row) => row.updated_at,
    rollupInventoryQty: (row) => row.rollup_inventory_qty ?? 0,
    variantCount:       (row) => row.variant_count ?? 0,
    imageCount:         (row) => row.image_count ?? 0,
    category:           (row) => row.category ?? null,
    productTypeCustom:  (row) => row.product_type_custom ?? null,
    seoHidden:          (row) => row.seo_hidden ?? false,
    templateSuffix:     (row) => row.template_suffix ?? null,
    visibleOnlineStore: (row) => row.visible_online_store ?? false,
    visiblePos:         (row) => row.visible_pos ?? false,
  },

  VariantRow: {
    // Variant fields
    variantId:          (row) => String(row.variant_id),
    shopId:             (row) => row.shop_id,
    shopifyVariantId:   (row) => String(row.shopify_variant_id),
    shopifyProductId:   (row) => String(row.shopify_product_id),
    variantTitle:       (row) => row.variant_title,
    sku:                (row) => row.sku ?? null,
    barcode:            (row) => row.barcode ?? null,
    price:              (row) => String(row.price ?? "0.00"),
    compareAtPrice:     (row) =>
      row.compare_at_price != null ? String(row.compare_at_price) : null,
    cost:               (row) =>
      row.cost != null ? String(row.cost) : null,
    profitMarginPct:    (row) =>
      row.profit_margin_pct != null ? Number(row.profit_margin_pct) : null,
    inventoryQuantity:  (row) => row.inventory_quantity ?? 0,
    trackQuantity:      (row) => row.track_quantity ?? false,
    taxable:            (row) => row.taxable ?? false,
    requiresShipping:   (row) => row.requires_shipping ?? false,
    weight:             (row) =>
      row.weight != null ? Number(row.weight) : null,
    weightUnit:         (row) => row.weight_unit ?? null,
    grams:              (row) => row.grams ?? null,
    option1Value:       (row) => row.option1_value ?? null,
    option2Value:       (row) => row.option2_value ?? null,
    option3Value:       (row) => row.option3_value ?? null,
    inventoryPolicy:    (row) => row.inventory_policy ?? null,
    fulfillmentService: (row) => row.fulfillment_service ?? null,
    availability:       (row) => row.availability ?? null,

    // Parent product rollup fields
    productId:          (row) => String(row.product_id),
    productTitle:       (row) => row.product_title,
    handle:             (row) => row.handle,
    vendor:             (row) => row.vendor ?? null,
    status:             (row) => row.status,
    rollupInventoryQty: (row) => row.rollup_inventory_qty ?? 0,
    variantCount:       (row) => row.variant_count ?? 0,
    imageCount:         (row) => row.image_count ?? 0,
    category:           (row) => row.category ?? null,
    productTypeCustom:  (row) => row.product_type_custom ?? null,
    visibleOnlineStore: (row) => row.visible_online_store ?? false,
    visiblePos:         (row) => row.visible_pos ?? false,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Guards
// ─────────────────────────────────────────────────────────────────────────────

function assertShopId(shopId) {
  if (!shopId) {
    throw new Error(
      "Unauthorized: no shopId in context. Ensure the request is authenticated.",
    );
  }
}