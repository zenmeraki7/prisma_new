// FILE: scripts/testProductFiltersPg.js

import { pool } from "../web/db/postgres/pool.js";
import {
  OPS,
  fetchProductsPage,
  fetchVariantsPage,
  buildPresetFilterGroup,
  PRESET_KEYS,
} from "../web/services/productService/productFilterService.pg.js";

async function main() {
  const shopId = Number(process.argv[2]);
  if (!shopId) {
    console.error("Usage: node scripts/testProductFiltersPg.js <shopId>");
    process.exit(1);
  }

  // 1) Simple product filter – active products with vendor containing "Nike"
  const productFilterConfig = {
    operator: "AND",
    conditions: [
      { key: OPS.PRODUCT_STATUS, operator: "EQ", value: "active" },
      { key: OPS.PRODUCT_VENDOR, operator: "CONTAINS", value: "Nike" },
    ],
  };

  const productsPage = await fetchProductsPage(pool, {
    shopId,
    filterConfig: productFilterConfig,
    sortKey: "CREATED_AT",
    sortDirection: "DESC",
    page: 1,
    pageSize: 10,
  });

  console.log("PRODUCTS:", productsPage.totalCount, "total");
  console.dir(productsPage.items, { depth: null });

  // 2) Variant-first preset – low inventory variants
  const variantFilterConfig = buildPresetFilterGroup(
    PRESET_KEYS.LOW_INVENTORY_VARIANT,
    { threshold: 5 }
  );

  const variantsPage = await fetchVariantsPage(pool, {
    shopId,
    filterConfig: variantFilterConfig,
    sortKey: "TOTAL_INVENTORY",
    sortDirection: "ASC",
    page: 1,
    pageSize: 10,
  });

  console.log("VARIANTS (low inventory):", variantsPage.totalCount, "total");
  console.dir(variantsPage.items, { depth: null });

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});