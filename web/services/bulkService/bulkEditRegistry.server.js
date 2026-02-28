// FILE: web/services/bulkService/bulkEditRegistry.server.js

/**
 * Bulk edit field registry – server-owned, fail-closed.
 *
 * Used for:
 *  - Backend validation (validateBulkEditPayload)
 *  - Frontend capabilities (getBulkEditFieldDefsForFrontend)
 */

/* -------------------------------------------------------------------------- */
/*  OPS – canonical bulk edit field keys                                      */
/* -------------------------------------------------------------------------- */

export const OPS = Object.freeze({
  // Product-level
  PRODUCT_TITLE: "PRODUCT_TITLE",
  PRODUCT_STATUS: "PRODUCT_STATUS",
  PRODUCT_VENDOR: "PRODUCT_VENDOR",
  PRODUCT_PRODUCT_TYPE: "PRODUCT_PRODUCT_TYPE",
  PRODUCT_TAGS: "PRODUCT_TAGS",
  PRODUCT_TEMPLATE_SUFFIX: "PRODUCT_TEMPLATE_SUFFIX",
  PRODUCT_SEO: "PRODUCT_SEO",

  // Variant-level – pricing
  VARIANT_PRICE: "VARIANT_PRICE",
  VARIANT_COMPARE_AT_PRICE: "VARIANT_COMPARE_AT_PRICE",

  // Variant-level – tax / shipping / inventory policy
  VARIANT_TAXABLE: "VARIANT_TAXABLE", // Charge tax on this product
  VARIANT_INVENTORY_POLICY: "VARIANT_INVENTORY_POLICY", // Inventory out-of-stock policy

  // Variant-level – physical / shipping
  VARIANT_PHYSICAL_PRODUCT: "VARIANT_PHYSICAL_PRODUCT", // requiresShipping

  // Variant-level – identifiers
  VARIANT_SKU: "VARIANT_SKU",
  VARIANT_BARCODE: "VARIANT_BARCODE",

  // Variant-level – weight (stubbed for now)
  VARIANT_WEIGHT: "VARIANT_WEIGHT",
});

/* -------------------------------------------------------------------------- */
/*  Operation types                                                           */
/* -------------------------------------------------------------------------- */

export const OP_TYPES = Object.freeze({
  SET: "SET",
  INCREMENT_PERCENT: "INCREMENT_PERCENT",
  INCREMENT_ABSOLUTE: "INCREMENT_ABSOLUTE",
});

/* -------------------------------------------------------------------------- */
/*  Target levels                                                             */
/* -------------------------------------------------------------------------- */

export const TARGET_LEVELS = Object.freeze({
  PRODUCT: "PRODUCT",
  VARIANT: "VARIANT",
});

/* -------------------------------------------------------------------------- */
/*  Registry: BULK_EDIT_FIELD_DEFS                                            */
/* -------------------------------------------------------------------------- */

/**
 * valueType:
 *  - "string"
 *  - "number"
 *  - "boolean"
 *  - "tags"
 *  - "seo"
 */

export const BULK_EDIT_FIELD_DEFS = Object.freeze({
  /* ───────────── PRODUCT FIELDS ───────────── */

  [OPS.PRODUCT_TITLE]: {
    key: OPS.PRODUCT_TITLE,
    targetLevel: TARGET_LEVELS.PRODUCT,
    allowedOps: [OP_TYPES.SET],
    valueType: "string",
    constraints: {
      stringMaxLength: 255,
      allowEmpty: false,
    },
    frontend: {
      label: "Product Title",
      description: "Set a new product title (supports {{originalTitle}} token).",
      group: "PRODUCT",
    },
  },

  [OPS.PRODUCT_STATUS]: {
    key: OPS.PRODUCT_STATUS,
    targetLevel: TARGET_LEVELS.PRODUCT,
    allowedOps: [OP_TYPES.SET],
    valueType: "string",
    constraints: {
      allowEmpty: false,
      enum: ["ACTIVE", "DRAFT", "ARCHIVED"],
    },
    frontend: {
      label: "Status",
      description: "Set product status (Active, Draft, Archived).",
      group: "PRODUCT",
    },
  },

  [OPS.PRODUCT_VENDOR]: {
    key: OPS.PRODUCT_VENDOR,
    targetLevel: TARGET_LEVELS.PRODUCT,
    allowedOps: [OP_TYPES.SET],
    valueType: "string",
    constraints: {
      stringMaxLength: 255,
      allowEmpty: true,
    },
    frontend: {
      label: "Vendor",
      description: "Set the product vendor.",
      group: "PRODUCT",
    },
  },

  [OPS.PRODUCT_PRODUCT_TYPE]: {
    key: OPS.PRODUCT_PRODUCT_TYPE,
    targetLevel: TARGET_LEVELS.PRODUCT,
    allowedOps: [OP_TYPES.SET],
    valueType: "string",
    constraints: {
      stringMaxLength: 255,
      allowEmpty: true,
    },
    frontend: {
      label: "Product Type",
      description: "Set the custom product type.",
      group: "PRODUCT",
    },
  },

  [OPS.PRODUCT_TAGS]: {
    key: OPS.PRODUCT_TAGS,
    targetLevel: TARGET_LEVELS.PRODUCT,
    allowedOps: [OP_TYPES.SET], // V1 = full replace
    valueType: "tags", // string[] or comma-separated string
    constraints: {
      maxTags: 250,
      tagMaxLength: 255,
    },
    frontend: {
      label: "Tags",
      description: "Replace product tags with a new set.",
      group: "PRODUCT",
    },
  },

  [OPS.PRODUCT_TEMPLATE_SUFFIX]: {
    key: OPS.PRODUCT_TEMPLATE_SUFFIX,
    targetLevel: TARGET_LEVELS.PRODUCT,
    allowedOps: [OP_TYPES.SET],
    valueType: "string",
    constraints: {
      stringMaxLength: 255,
      allowEmpty: true,
    },
    frontend: {
      label: "Theme Template",
      description: "Set the theme template suffix.",
      group: "PRODUCT",
    },
  },

  [OPS.PRODUCT_SEO]: {
    key: OPS.PRODUCT_SEO,
    targetLevel: TARGET_LEVELS.PRODUCT,
    allowedOps: [OP_TYPES.SET],
    valueType: "seo", // { title, description }
    constraints: {
      seoTitleMaxLength: 70,
      seoDescriptionMaxLength: 320,
    },
    frontend: {
      label: "SEO Title & Description",
      description: "Set product SEO title and description.",
      group: "SEO",
    },
  },

  /* ───────────── VARIANT FIELDS – PRICING ───────────── */

  [OPS.VARIANT_PRICE]: {
    key: OPS.VARIANT_PRICE,
    targetLevel: TARGET_LEVELS.VARIANT,
    allowedOps: [
      OP_TYPES.SET,
      OP_TYPES.INCREMENT_PERCENT,
      OP_TYPES.INCREMENT_ABSOLUTE,
    ],
    valueType: "number",
    constraints: {
      min: 0,
      max: 1_000_000,
      defaultRoundTo: 2,
    },
    frontend: {
      label: "Variant Price",
      description: "Set or adjust variant price.",
      group: "PRICING",
    },
  },

  [OPS.VARIANT_COMPARE_AT_PRICE]: {
    key: OPS.VARIANT_COMPARE_AT_PRICE,
    targetLevel: TARGET_LEVELS.VARIANT,
    allowedOps: [
      OP_TYPES.SET,
      OP_TYPES.INCREMENT_PERCENT,
      OP_TYPES.INCREMENT_ABSOLUTE,
    ],
    valueType: "number",
    constraints: {
      min: 0,
      max: 1_000_000,
      defaultRoundTo: 2,
    },
    frontend: {
      label: "Compare-at Price",
      description: "Set or adjust variant compare-at price.",
      group: "PRICING",
    },
  },

  /* ───────────── VARIANT FIELDS – TAX / INVENTORY POLICY ───────────── */

  [OPS.VARIANT_TAXABLE]: {
    key: OPS.VARIANT_TAXABLE,
    targetLevel: TARGET_LEVELS.VARIANT,
    allowedOps: [OP_TYPES.SET],
    valueType: "boolean",
    constraints: {},
    frontend: {
      label: "Charge Tax",
      description: "Charge tax on this variant.",
      group: "TAX & SHIPPING",
    },
  },

  [OPS.VARIANT_INVENTORY_POLICY]: {
    key: OPS.VARIANT_INVENTORY_POLICY,
    targetLevel: TARGET_LEVELS.VARIANT,
    allowedOps: [OP_TYPES.SET],
    valueType: "string",
    constraints: {
      allowEmpty: false,
      // Shopify ProductVariantInventoryPolicy
      enum: ["DENY", "CONTINUE"],
    },
    frontend: {
      label: "Inventory Out-of-stock Policy",
      description: "Allow purchases when out of stock (CONTINUE) or deny (DENY).",
      group: "INVENTORY",
    },
  },

  /* ───────────── VARIANT FIELDS – PHYSICAL / SHIPPING ───────────── */

  [OPS.VARIANT_PHYSICAL_PRODUCT]: {
    key: OPS.VARIANT_PHYSICAL_PRODUCT,
    targetLevel: TARGET_LEVELS.VARIANT,
    allowedOps: [OP_TYPES.SET],
    valueType: "boolean",
    constraints: {},
    frontend: {
      label: "Physical Product",
      description: "Controls whether the variant requires shipping.",
      group: "TAX & SHIPPING",
    },
  },

  /* ───────────── VARIANT FIELDS – IDENTIFIERS ───────────── */

  [OPS.VARIANT_SKU]: {
    key: OPS.VARIANT_SKU,
    targetLevel: TARGET_LEVELS.VARIANT,
    allowedOps: [OP_TYPES.SET],
    valueType: "string",
    constraints: {
      stringMaxLength: 255,
      allowEmpty: true,
    },
    frontend: {
      label: "SKU",
      description: "Set or replace the variant SKU.",
      group: "IDENTIFIERS",
    },
  },

  [OPS.VARIANT_BARCODE]: {
    key: OPS.VARIANT_BARCODE,
    targetLevel: TARGET_LEVELS.VARIANT,
    allowedOps: [OP_TYPES.SET],
    valueType: "string",
    constraints: {
      stringMaxLength: 255,
      allowEmpty: true,
    },
    frontend: {
      label: "Barcode",
      description: "Set or replace the variant barcode (ISBN, UPC, GTIN, etc.).",
      group: "IDENTIFIERS",
    },
  },

  /* ───────────── VARIANT FIELDS – WEIGHT (STUB) ───────────── */

  [OPS.VARIANT_WEIGHT]: {
    key: OPS.VARIANT_WEIGHT,
    targetLevel: TARGET_LEVELS.VARIANT,
    allowedOps: [
      OP_TYPES.SET,
      OP_TYPES.INCREMENT_PERCENT,
      OP_TYPES.INCREMENT_ABSOLUTE,
    ],
    valueType: "number",
    constraints: {
      min: 0,
      max: 100_000,
      defaultRoundTo: 3,
    },
    frontend: {
      label: "Weight",
      description:
        "Set or adjust variant weight. (GraphQL wiring TBD: uses inventoryItem.measurement.weight).",
      group: "TAX & SHIPPING",
    },
  },
});

/* -------------------------------------------------------------------------- */
/*  Public view for frontend                                                  */
/* -------------------------------------------------------------------------- */

export function getBulkEditFieldDefsForFrontend() {
  return Object.values(BULK_EDIT_FIELD_DEFS).map((def) => ({
    key: def.key,
    targetLevel: def.targetLevel,
    allowedOps: def.allowedOps,
    valueType: def.valueType,
    constraints: def.constraints,
    label: def.frontend.label,
    description: def.frontend.description,
    group: def.frontend.group,
  }));
}

/* -------------------------------------------------------------------------- */
/*  Validation of BulkEditPayloadV1                                           */
/* -------------------------------------------------------------------------- */

export function validateBulkEditPayload(rawPayload) {
  if (!rawPayload || typeof rawPayload !== "object") {
    throw new Error("bulkEditPayload.invalid: payload must be an object");
  }

  const { version, targetLevel, operations } = rawPayload;

  if (version !== 1) {
    throw new Error("bulkEditPayload.invalidVersion");
  }

  if (!Object.values(TARGET_LEVELS).includes(targetLevel)) {
    throw new Error("bulkEditPayload.invalidTargetLevel");
  }

  if (!Array.isArray(operations) || operations.length === 0) {
    throw new Error("bulkEditPayload.emptyOperations");
  }

  const normalizedOps = operations.map((op, index) =>
    validateOperation(op, index, targetLevel),
  );

  return {
    version: 1,
    targetLevel,
    operations: normalizedOps,
  };
}

function validateOperation(op, index, payloadTargetLevel) {
  if (!op || typeof op !== "object") {
    throw new Error(`bulkEditPayload.op[${index}].invalid: must be an object`);
  }

  const { target, field, op: opType, value, roundTo } = op;

  if (!Object.values(TARGET_LEVELS).includes(target)) {
    throw new Error(`bulkEditPayload.op[${index}].invalidTarget`);
  }

  const def = BULK_EDIT_FIELD_DEFS[field];
  if (!def) {
    throw new Error(`bulkEditPayload.op[${index}].unknownField`);
  }

  if (def.targetLevel !== payloadTargetLevel) {
    throw new Error(`bulkEditPayload.op[${index}].targetLevelMismatch`);
  }

  if (def.targetLevel !== target) {
    throw new Error(`bulkEditPayload.op[${index}].targetMismatch`);
  }

  if (!def.allowedOps.includes(opType)) {
    throw new Error(`bulkEditPayload.op[${index}].unsupportedOp`);
  }

  // Validate value shape & constraints
  validateOperationValue(def, opType, value, roundTo, index);

  // Normalize and return a cleaned operation
  const normalized = {
    target,
    field,
    op: opType,
  };

  if (def.valueType === "number") {
    normalized.value = Number(value);
    if (!Number.isFinite(normalized.value)) {
      throw new Error(`bulkEditPayload.op[${index}].valueNotNumber`);
    }
    if (typeof roundTo === "number") {
      normalized.roundTo = Math.max(0, Math.min(6, Math.floor(roundTo)));
    } else if (def.constraints?.defaultRoundTo != null) {
      normalized.roundTo = def.constraints.defaultRoundTo;
    }
  } else if (def.valueType === "tags") {
    let tags;
    if (Array.isArray(value)) {
      tags = value.map((t) => String(t).trim()).filter(Boolean);
    } else if (typeof value === "string") {
      tags = value
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
    } else {
      throw new Error(`bulkEditPayload.op[${index}].invalidTagsValue`);
    }
    normalized.value = tags;
  } else if (def.valueType === "seo") {
    if (!value || typeof value !== "object") {
      throw new Error(`bulkEditPayload.op[${index}].invalidSeoValue`);
    }
    const seo = {};
    if (value.title != null) seo.title = String(value.title);
    if (value.description != null) seo.description = String(value.description);
    normalized.value = seo;
  } else if (def.valueType === "boolean") {
    // Accept boolean or truthy/falsey string
    if (typeof value === "boolean") {
      normalized.value = value;
    } else if (typeof value === "string") {
      const lower = value.toLowerCase();
      if (lower === "true" || lower === "1" || lower === "yes") {
        normalized.value = true;
      } else if (lower === "false" || lower === "0" || lower === "no") {
        normalized.value = false;
      } else {
        throw new Error(`bulkEditPayload.op[${index}].valueNotBoolean`);
      }
    } else {
      throw new Error(`bulkEditPayload.op[${index}].valueNotBoolean`);
    }
  } else {
    // string / generic
    const s =
      value != null ? String(value) : def.constraints?.allowEmpty ? "" : null;
    if (s === null) {
      throw new Error(`bulkEditPayload.op[${index}].valueRequired`);
    }
    normalized.value = s;
  }

  // Enforce enum constraints for string-like values
  if (def.constraints?.enum && def.valueType === "string") {
    const upper = String(normalized.value).toUpperCase();
    if (!def.constraints.enum.includes(upper)) {
      throw new Error(`bulkEditPayload.op[${index}].enumMismatch`);
    }
    normalized.value = upper;
  }

  return normalized;
}

function validateOperationValue(def, opType, value, roundTo, index) {
  const { valueType, constraints = {} } = def;

  if (valueType === "number") {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      throw new Error(`bulkEditPayload.op[${index}].valueNotNumber`);
    }
    if (constraints.min != null && n < constraints.min) {
      throw new Error(`bulkEditPayload.op[${index}].belowMin`);
    }
    if (constraints.max != null && n > constraints.max) {
      throw new Error(`bulkEditPayload.op[${index}].aboveMax`);
    }

    if (
      roundTo != null &&
      (!Number.isInteger(roundTo) || roundTo < 0 || roundTo > 6)
    ) {
      throw new Error(`bulkEditPayload.op[${index}].invalidRoundTo`);
    }

    if (
      opType !== OP_TYPES.SET &&
      opType !== OP_TYPES.INCREMENT_PERCENT &&
      opType !== OP_TYPES.INCREMENT_ABSOLUTE
    ) {
      throw new Error(`bulkEditPayload.op[${index}].invalidNumberOp`);
    }

    return;
  }

  if (valueType === "seo") {
    if (!value || typeof value !== "object") {
      throw new Error(`bulkEditPayload.op[${index}].invalidSeoValue`);
    }
    const { title, description } = value;

    if (
      title != null &&
      constraints.seoTitleMaxLength &&
      String(title).length > constraints.seoTitleMaxLength
    ) {
      throw new Error(`bulkEditPayload.op[${index}].seoTitleTooLong`);
    }

    if (
      description != null &&
      constraints.seoDescriptionMaxLength &&
      String(description).length > constraints.seoDescriptionMaxLength
    ) {
      throw new Error(`bulkEditPayload.op[${index}].seoDescTooLong`);
    }
    return;
  }

  if (valueType === "tags") {
    if (Array.isArray(value)) {
      if (constraints.maxTags != null && value.length > constraints.maxTags) {
        throw new Error(`bulkEditPayload.op[${index}].tooManyTags`);
      }
      for (const tag of value) {
        if (
          constraints.tagMaxLength &&
          String(tag).length > constraints.tagMaxLength
        ) {
          throw new Error(`bulkEditPayload.op[${index}].tagTooLong`);
        }
      }
      return;
    }

    if (typeof value === "string") {
      const tags = value
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      if (constraints.maxTags != null && tags.length > constraints.maxTags) {
        throw new Error(`bulkEditPayload.op[${index}].tooManyTags`);
      }
      for (const tag of tags) {
        if (
          constraints.tagMaxLength &&
          String(tag).length > constraints.tagMaxLength
        ) {
          throw new Error(`bulkEditPayload.op[${index}].tagTooLong`);
        }
      }
      return;
    }

    throw new Error(`bulkEditPayload.op[${index}].invalidTagsValue`);
  }

  // boolean and string are already fully validated/normalized in validateOperation
}