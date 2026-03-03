// FILE: web/frontend/graphql/productFilter.queries.ts
//
// All GraphQL query documents for the product filter surface.
// These are plain template literals — no codegen required, no gql tag needed.
// They are consumed by the custom fetch-based GraphQL client
// (see web/frontend/lib/graphqlClient.ts).
//
// Usage:
//   import { FILTERED_PRODUCTS_QUERY } from "../graphql/productFilter.queries";
//   const data = await getGraphQLClient().query<FilteredProductsData>(
//     FILTERED_PRODUCTS_QUERY,
//     { filter, sort, direction, pagination },
//   );

// ─────────────────────────────────────────────────────────────────────────────
// Fragments  —  reused across multiple queries
// ─────────────────────────────────────────────────────────────────────────────

export const PAGE_INFO_FRAGMENT = /* GraphQL */ `
  fragment PageInfoFields on PageInfo {
    page
    pageSize
    totalCount
    totalPages
    hasNextPage
    hasPrevPage
  }
`;

export const PRODUCT_ROW_FRAGMENT = /* GraphQL */ `
  fragment ProductRowFields on ProductRow {
    id
    shopId
    shopifyProductId
    title
    handle
    vendor
    status
    createdAt
    publishedAt
    updatedAt
    rollupInventoryQty
    variantCount
    imageCount
    category
    productTypeCustom
    seoHidden
    templateSuffix
    visibleOnlineStore
    visiblePos
  }
`;

export const VARIANT_ROW_FRAGMENT = /* GraphQL */ `
  fragment VariantRowFields on VariantRow {
    variantId
    shopId
    shopifyVariantId
    shopifyProductId
    variantTitle
    sku
    barcode
    price
    compareAtPrice
    cost
    profitMarginPct
    inventoryQuantity
    trackQuantity
    taxable
    requiresShipping
    weight
    weightUnit
    grams
    option1Value
    option2Value
    option3Value
    inventoryPolicy
    fulfillmentService
    availability
    productId
    productTitle
    handle
    vendor
    status
    rollupInventoryQty
    variantCount
    imageCount
    category
    productTypeCustom
    visibleOnlineStore
    visiblePos
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// Filtered queries
// ─────────────────────────────────────────────────────────────────────────────

export const FILTERED_PRODUCTS_QUERY = /* GraphQL */ `
  ${PAGE_INFO_FRAGMENT}
  ${PRODUCT_ROW_FRAGMENT}

  query FilteredProducts(
    $filter:     FilterGroupInput
    $sort:       SortKey        = CREATED_AT
    $direction:  SortDirection  = DESC
    $pagination: PaginationInput
  ) {
    filteredProducts(
      filter:     $filter
      sort:       $sort
      direction:  $direction
      pagination: $pagination
    ) {
      pageInfo { ...PageInfoFields }
      items    { ...ProductRowFields }
    }
  }
`;

export const FILTERED_VARIANTS_QUERY = /* GraphQL */ `
  ${PAGE_INFO_FRAGMENT}
  ${VARIANT_ROW_FRAGMENT}

  query FilteredVariants(
    $filter:     FilterGroupInput
    $sort:       SortKey        = CREATED_AT
    $direction:  SortDirection  = DESC
    $pagination: PaginationInput
  ) {
    filteredVariants(
      filter:     $filter
      sort:       $sort
      direction:  $direction
      pagination: $pagination
    ) {
      pageInfo { ...PageInfoFields }
      items    { ...VariantRowFields }
    }
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// Preset queries
// ─────────────────────────────────────────────────────────────────────────────

export const PRESET_PRODUCTS_QUERY = /* GraphQL */ `
  ${PAGE_INFO_FRAGMENT}
  ${PRODUCT_ROW_FRAGMENT}

  query PresetProducts(
    $preset:     PresetKey!
    $threshold:  Int
    $pagination: PaginationInput
  ) {
    presetProducts(
      preset:     $preset
      threshold:  $threshold
      pagination: $pagination
    ) {
      pageInfo { ...PageInfoFields }
      items    { ...ProductRowFields }
    }
  }
`;

export const PRESET_VARIANTS_QUERY = /* GraphQL */ `
  ${PAGE_INFO_FRAGMENT}
  ${VARIANT_ROW_FRAGMENT}

  query PresetVariants(
    $preset:     PresetKey!
    $threshold:  Int
    $pagination: PaginationInput
  ) {
    presetVariants(
      preset:     $preset
      threshold:  $threshold
      pagination: $pagination
    ) {
      pageInfo { ...PageInfoFields }
      items    { ...VariantRowFields }
    }
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// Validation + registry queries
// ─────────────────────────────────────────────────────────────────────────────

export const VALIDATE_FILTER_QUERY = /* GraphQL */ `
  query ValidateFilterGroup($filter: FilterGroupInput!) {
    validateFilterGroup(filter: $filter) {
      valid
      errors {
        path
        message
      }
    }
  }
`;

export const FILTER_REGISTRY_QUERY = /* GraphQL */ `
  query FilterRegistry {
    filterRegistry {
      productFilters {
        key
        label
        level
        valueType
        operators
        sortable
        isComputed
        enumValues
      }
      variantFilters {
        key
        label
        level
        valueType
        operators
        sortable
        isComputed
        enumValues
      }
      allFilters {
        key
        label
        level
        valueType
        operators
        sortable
        isComputed
        enumValues
      }
    }
    sortDefinitions {
      key
      defaultDirection
      requiresVariantJoin
    }
    presetDefinitions {
      key
      label
      description
    }
  }
`;