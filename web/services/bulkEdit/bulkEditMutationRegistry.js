// Mutation registry you should build

// web/services/bulkEdit/bulkEditMutationRegistry.js

export const BULK_EDIT_MUTATIONS = Object.freeze({
  PRODUCT_TITLE_SET: {
    scope: "product",
    mutationName: "productUpdate",
    variableBuilder: ({ productGid, value }) => ({
      input: {
        id: productGid,
        title: value,
      },
    }),
    mutation: `
      mutation productUpdate($input: ProductUpdateInput!) {
        productUpdate(input: $input) {
          product { id title }
          userErrors { field message }
        }
      }
    `,
  },

  PRODUCT_TAGS_SET: {
    scope: "product",
    mutationName: "productUpdate",
    variableBuilder: ({ productGid, value }) => ({
      input: {
        id: productGid,
        tags: value,
      },
    }),
    mutation: `
      mutation productUpdate($input: ProductUpdateInput!) {
        productUpdate(input: $input) {
          product { id }
          userErrors { field message }
        }
      }
    `,
  },

  VARIANT_PRICE_SET: {
    scope: "variant",
    mutationName: "productVariantsBulkUpdate",
    groupBy: "productGid",
    variableBuilderGrouped: ({ productGid, rows, value }) => ({
      productId: productGid,
      variants: rows.map((row) => ({
        id: row.variantGid,
        price: String(value),
      })),
    }),
    mutation: `
      mutation productVariantsBulkUpdate(
        $productId: ID!,
        $variants: [ProductVariantsBulkInput!]!
      ) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          product { id }
          productVariants { id }
          userErrors { field message }
        }
      }
    `,
  },
});