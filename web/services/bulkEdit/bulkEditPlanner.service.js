// FILE: web/services/bulkEdit/bulkEditPlanner.service.js

const PRODUCT_UPDATE_MUTATION = `
mutation productUpdate($input: ProductUpdateInput!) {
  productUpdate(input: $input) {
    product {
      id
      title
      vendor
      productType
      tags
    }
    userErrors {
      field
      message
    }
  }
}
`;

const PRODUCT_VARIANTS_BULK_UPDATE_MUTATION = `
mutation productVariantsBulkUpdate(
  $productId: ID!,
  $variants: [ProductVariantsBulkInput!]!
) {
  productVariantsBulkUpdate(productId: $productId, variants: $variants) {
    product {
      id
    }
    productVariants {
      id
      price
      compareAtPrice
      sku
      barcode
    }
    userErrors {
      field
      message
    }
  }
}
`;

const SUPPORTED_PLANS = {
  "product.title:SET": {
    scope: "PRODUCT",
    mutationName: "productUpdate",
    mutation: PRODUCT_UPDATE_MUTATION,
    buildProductVariables({ row, value }) {
      return {
        input: {
          id: row.productGid,
          title: String(value),
        },
      };
    },
  },

  "product.vendor:SET": {
    scope: "PRODUCT",
    mutationName: "productUpdate",
    mutation: PRODUCT_UPDATE_MUTATION,
    buildProductVariables({ row, value }) {
      return {
        input: {
          id: row.productGid,
          vendor: value == null ? null : String(value),
        },
      };
    },
  },

  "product.productType:SET": {
    scope: "PRODUCT",
    mutationName: "productUpdate",
    mutation: PRODUCT_UPDATE_MUTATION,
    buildProductVariables({ row, value }) {
      return {
        input: {
          id: row.productGid,
          productType: value == null ? null : String(value),
        },
      };
    },
  },

  "product.tags:SET": {
    scope: "PRODUCT",
    mutationName: "productUpdate",
    mutation: PRODUCT_UPDATE_MUTATION,
    buildProductVariables({ row, value }) {
      if (!Array.isArray(value)) {
        throw new Error("product.tags requires value to be a string[]");
      }

      return {
        input: {
          id: row.productGid,
          tags: value.map((v) => String(v)),
        },
      };
    },
  },

  "variant.price:SET": {
    scope: "VARIANT",
    mutationName: "productVariantsBulkUpdate",
    mutation: PRODUCT_VARIANTS_BULK_UPDATE_MUTATION,
    buildVariantVariables({ productGid, rows, value }) {
      return {
        productId: productGid,
        variants: rows.map((row) => ({
          id: row.variantGid,
          price: String(value),
        })),
      };
    },
  },

  "variant.compareAtPrice:SET": {
    scope: "VARIANT",
    mutationName: "productVariantsBulkUpdate",
    mutation: PRODUCT_VARIANTS_BULK_UPDATE_MUTATION,
    buildVariantVariables({ productGid, rows, value }) {
      return {
        productId: productGid,
        variants: rows.map((row) => ({
          id: row.variantGid,
          compareAtPrice: String(value),
        })),
      };
    },
  },

  "variant.sku:SET": {
    scope: "VARIANT",
    mutationName: "productVariantsBulkUpdate",
    mutation: PRODUCT_VARIANTS_BULK_UPDATE_MUTATION,
    buildVariantVariables({ productGid, rows, value }) {
      return {
        productId: productGid,
        variants: rows.map((row) => ({
          id: row.variantGid,
          sku: value == null ? null : String(value),
        })),
      };
    },
  },

  "variant.barcode:SET": {
    scope: "VARIANT",
    mutationName: "productVariantsBulkUpdate",
    mutation: PRODUCT_VARIANTS_BULK_UPDATE_MUTATION,
    buildVariantVariables({ productGid, rows, value }) {
      return {
        productId: productGid,
        variants: rows.map((row) => ({
          id: row.variantGid,
          barcode: value == null ? null : String(value),
        })),
      };
    },
  },
};

function assertNonEmptyString(value, fieldName) {
  if (!value || typeof value !== "string") {
    throw new Error(`Missing or invalid ${fieldName}`);
  }
}

function normalizeSelection(selection) {
  if (!selection) return null;

  if (typeof selection !== "object") {
    throw new Error("selection must be an object when provided");
  }

  const { mode, where, ids } = selection;

  if (
    mode &&
    ![
      "PRODUCT_WHERE",
      "VARIANT_WHERE",
      "PRODUCT_IDS",
      "VARIANT_IDS",
    ].includes(mode)
  ) {
    throw new Error(`Unsupported selection.mode "${mode}"`);
  }

  if (mode?.endsWith("_WHERE") && (!where || typeof where !== "object")) {
    throw new Error(`${mode} requires selection.where`);
  }

  if (mode?.endsWith("_IDS") && (!Array.isArray(ids) || ids.length === 0)) {
    throw new Error(`${mode} requires non-empty selection.ids`);
  }

  return {
    mode: mode ?? null,
    where: where ?? null,
    ids: ids ?? null,
  };
}

export function normalizeBulkEditPayload(body) {
  const scope = String(body.scope || "").toUpperCase();
  const fieldKey = body.fieldKey;
  const action = String(body.action || "SET").toUpperCase();
  const value = body.value;
  const selection = normalizeSelection(body.selection);
  const filterExpr = body.filterExpr ?? null;

  if (!["PRODUCT", "VARIANT"].includes(scope)) {
    throw new Error('scope must be "PRODUCT" or "VARIANT"');
  }

  assertNonEmptyString(fieldKey, "fieldKey");

  if (!["SET"].includes(action)) {
    throw new Error(`Unsupported action "${action}". This implementation supports SET only.`);
  }

  if (!selection && !filterExpr) {
    throw new Error("Either filterExpr or selection must be provided");
  }

  return {
    scope,
    fieldKey,
    action,
    value,
    selection,
    filterExpr,
  };
}

export function getBulkEditPlanOrThrow(payload) {
  const key = `${payload.fieldKey}:${payload.action}`;
  const plan = SUPPORTED_PLANS[key];

  if (!plan) {
    throw new Error(`Unsupported bulk edit operation: ${key}`);
  }

  if (plan.scope !== payload.scope) {
    throw new Error(
      `Scope mismatch: field "${payload.fieldKey}" requires ${plan.scope}, got ${payload.scope}`,
    );
  }

  return plan;
}