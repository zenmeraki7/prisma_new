-- FILE: web/db/postgres/migrations/001_init_shopify_mirror.sql

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- Extensions (Neon-safe)
-- ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- ─────────────────────────────────────────────────────────────
-- Core enums
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'product_status') THEN
    CREATE TYPE product_status AS ENUM ('active', 'draft', 'archived');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'weight_unit') THEN
    CREATE TYPE weight_unit AS ENUM ('g', 'kg', 'oz', 'lb');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inventory_out_of_stock_policy') THEN
    CREATE TYPE inventory_out_of_stock_policy AS ENUM ('deny', 'continue');
  END IF;
END$$;

-- ─────────────────────────────────────────────────────────────
-- Shops (multi-tenant root)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shops (
  id               BIGSERIAL PRIMARY KEY,
  shop_domain      TEXT        NOT NULL UNIQUE,
  shopify_shop_id  BIGINT,                 -- optional, if you map it
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- Product mirror
--  - One row per Shopify product per shop
--  - All product-level filters live here or via join tables
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_mirror (
  id                    BIGSERIAL PRIMARY KEY,

  shop_id               BIGINT      NOT NULL REFERENCES shops(id) ON DELETE CASCADE,

  -- Shopify numeric product id (not the GID string)
  shopify_product_id    BIGINT      NOT NULL,

  -- Product Fields (filters)
  category              TEXT,                 -- Category
  description_html      TEXT,                 -- Description
  handle                TEXT        NOT NULL, -- Handle (URL)
  product_type_custom   TEXT,                 -- Product Type (Custom)
  status                product_status NOT NULL,
  theme_template        TEXT,                 -- Theme Template (template_suffix)
  title                 TEXT        NOT NULL, -- Title
  vendor                TEXT,                 -- Vendor

  created_at            TIMESTAMPTZ NOT NULL, -- Date Created
  published_at          TIMESTAMPTZ,          -- Date Published
  updated_at            TIMESTAMPTZ NOT NULL, -- Date Updated

  -- Search engine visibility & channel visibility
  seo_hidden            BOOLEAN     NOT NULL DEFAULT FALSE, -- Search Engine Visibility
  visible_online_store  BOOLEAN     NOT NULL DEFAULT FALSE, -- Visible on Online Store (web)
  visible_pos           BOOLEAN     NOT NULL DEFAULT FALSE, -- Visible on Point of Sale (POS)

  -- Options (names) – product-level
  option1_name          TEXT,
  option2_name          TEXT,
  option3_name          TEXT,

  -- Rollups / denorms for filter speed
  total_inventory_qty   INTEGER     NOT NULL DEFAULT 0, -- Inventory Quantity (product level)
  variant_count         INTEGER     NOT NULL DEFAULT 0, -- Variant Count

  -- SEO metadata (optional but handy)
  seo_title             TEXT,
  seo_description       TEXT,

  -- For safe upserts & concurrency
  sync_cursor           TEXT,        -- optional, e.g. last bulk op id
  raw_payload_hash      TEXT,        -- optional, hash to detect changes

  UNIQUE (shop_id, shopify_product_id),
  UNIQUE (shop_id, handle)
);

-- Indexes tuned for your filters
CREATE INDEX IF NOT EXISTS idx_product_mirror_shop_status
  ON product_mirror (shop_id, status);

CREATE INDEX IF NOT EXISTS idx_product_mirror_shop_vendor
  ON product_mirror (shop_id, vendor);

CREATE INDEX IF NOT EXISTS idx_product_mirror_shop_category
  ON product_mirror (shop_id, category);

CREATE INDEX IF NOT EXISTS idx_product_mirror_shop_created_at
  ON product_mirror (shop_id, created_at);

CREATE INDEX IF NOT EXISTS idx_product_mirror_shop_published_at
  ON product_mirror (shop_id, published_at);

CREATE INDEX IF NOT EXISTS idx_product_mirror_shop_updated_at
  ON product_mirror (shop_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_product_mirror_shop_title_trgm
  ON product_mirror USING GIN (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_product_mirror_shop_handle_trgm
  ON product_mirror USING GIN (handle gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_product_mirror_shop_inventory_qty
  ON product_mirror (shop_id, total_inventory_qty);

CREATE INDEX IF NOT EXISTS idx_product_mirror_shop_variant_count
  ON product_mirror (shop_id, variant_count);

CREATE INDEX IF NOT EXISTS idx_product_mirror_shop_visibility
  ON product_mirror (shop_id, visible_online_store, visible_pos, seo_hidden);

-- ─────────────────────────────────────────────────────────────
-- Collections & product<->collection join
--  - For "Collection" product filters
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS collections (
  id                   BIGSERIAL PRIMARY KEY,
  shop_id              BIGINT     NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  shopify_collection_id BIGINT    NOT NULL,
  title                TEXT       NOT NULL,
  handle               TEXT       NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (shop_id, shopify_collection_id),
  UNIQUE (shop_id, handle)
);

CREATE INDEX IF NOT EXISTS idx_collections_shop_title_trgm
  ON collections USING GIN (title gin_trgm_ops);

CREATE TABLE IF NOT EXISTS product_collections (
  product_id           BIGINT NOT NULL REFERENCES product_mirror(id) ON DELETE CASCADE,
  collection_id        BIGINT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,

  PRIMARY KEY (product_id, collection_id)
);

-- For filtering by collection within a shop
CREATE INDEX IF NOT EXISTS idx_product_collections_collection_product
  ON product_collections (collection_id, product_id);

-- ─────────────────────────────────────────────────────────────
-- Tags & product<->tag join
--  - For "Tag" product filter
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tags (
  id          BIGSERIAL PRIMARY KEY,
  shop_id     BIGINT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name        TEXT   NOT NULL,

  UNIQUE (shop_id, name)
);

CREATE TABLE IF NOT EXISTS product_tags (
  product_id  BIGINT NOT NULL REFERENCES product_mirror(id) ON DELETE CASCADE,
  tag_id      BIGINT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,

  PRIMARY KEY (product_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_product_tags_tag_product
  ON product_tags (tag_id, product_id);

-- ─────────────────────────────────────────────────────────────
-- Locations
--  - For "Connected Inventory Location" filter
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS locations (
  id                  BIGSERIAL PRIMARY KEY,
  shop_id             BIGINT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  shopify_location_id BIGINT NOT NULL,
  name                TEXT   NOT NULL,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,

  UNIQUE (shop_id, shopify_location_id)
);

CREATE INDEX IF NOT EXISTS idx_locations_shop_name_trgm
  ON locations USING GIN (name gin_trgm_ops);

-- ─────────────────────────────────────────────────────────────
-- Variant mirror
--  - One row per Shopify variant per shop
--  - All variant-level filters live here or via inventory levels
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS variant_mirror (
  id                        BIGSERIAL PRIMARY KEY,

  shop_id                   BIGINT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,

  -- Shopify numeric ids
  shopify_variant_id        BIGINT NOT NULL,
  shopify_product_id        BIGINT NOT NULL,

  product_id                BIGINT NOT NULL REFERENCES product_mirror(id) ON DELETE CASCADE,

  -- Variant Fields (filters)
  barcode                   TEXT,                -- Barcode (ISBN, UPC, GTIN, etc.)
  charge_tax                BOOLEAN NOT NULL DEFAULT TRUE,   -- Charge tax on this product
  compare_at_price          NUMERIC(18, 4),      -- Compare-at Price
  cost                      NUMERIC(18, 4),      -- Cost
  country_of_origin         TEXT,                -- Country of Origin (ISO code)
  hs_tariff_code            TEXT,                -- HS Tariff Code
  inventory_out_of_stock_policy inventory_out_of_stock_policy NOT NULL DEFAULT 'deny',
  physical_product          BOOLEAN NOT NULL DEFAULT TRUE,   -- Physical Product
  price                     NUMERIC(18, 4) NOT NULL,         -- Price
  profit_margin_pct         NUMERIC(7, 4),       -- Profit Margin (percentage)
  sku                       TEXT,                -- SKU
  track_quantity            BOOLEAN NOT NULL DEFAULT TRUE,   -- Track Quantity
  inventory_quantity        INTEGER NOT NULL DEFAULT 0,      -- Variant Inventory Quantity
  title                     TEXT NOT NULL,      -- Variant Title
  weight                    NUMERIC(10, 3),     -- Weight
  weight_unit               weight_unit,        -- Weight Unit

  -- Option values (names are on product_mirror)
  option1_value             TEXT,               -- Option 1 Value
  option2_value             TEXT,               -- Option 2 Value
  option3_value             TEXT,               -- Option 3 Value

  -- Shopify inventory metadata
  inventory_item_id         BIGINT,             -- Shopify inventory_item.id
  -- inventory_management etc. can be added if needed

  -- Concurrency / sync
  sync_cursor               TEXT,
  raw_payload_hash          TEXT,

  UNIQUE (shop_id, shopify_variant_id),
  CONSTRAINT fk_variant_product_shop_consistent
    FOREIGN KEY (shop_id, shopify_product_id)
    REFERENCES product_mirror (shop_id, shopify_product_id)
    ON DELETE CASCADE
);

-- Indexes for variant filters
CREATE INDEX IF NOT EXISTS idx_variant_mirror_shop_product
  ON variant_mirror (shop_id, shopify_product_id);

CREATE INDEX IF NOT EXISTS idx_variant_mirror_shop_sku
  ON variant_mirror (shop_id, sku);

CREATE INDEX IF NOT EXISTS idx_variant_mirror_shop_barcode
  ON variant_mirror (shop_id, barcode);

CREATE INDEX IF NOT EXISTS idx_variant_mirror_shop_price
  ON variant_mirror (shop_id, price);

CREATE INDEX IF NOT EXISTS idx_variant_mirror_shop_compare_at_price
  ON variant_mirror (shop_id, compare_at_price);

CREATE INDEX IF NOT EXISTS idx_variant_mirror_shop_cost
  ON variant_mirror (shop_id, cost);

CREATE INDEX IF NOT EXISTS idx_variant_mirror_shop_profit_margin
  ON variant_mirror (shop_id, profit_margin_pct);

CREATE INDEX IF NOT EXISTS idx_variant_mirror_shop_inventory_qty
  ON variant_mirror (shop_id, inventory_quantity);

CREATE INDEX IF NOT EXISTS idx_variant_mirror_shop_title_trgm
  ON variant_mirror USING GIN (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_variant_mirror_shop_weight
  ON variant_mirror (shop_id, weight);

-- Optional: normalize country/hs for faster grouping if you care later
CREATE INDEX IF NOT EXISTS idx_variant_mirror_shop_country_hs
  ON variant_mirror (shop_id, country_of_origin, hs_tariff_code);

-- ─────────────────────────────────────────────────────────────
-- Variant inventory levels per location
--  - For "Connected Inventory Location" + per-location quantities
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS variant_inventory_levels (
  variant_id            BIGINT NOT NULL REFERENCES variant_mirror(id) ON DELETE CASCADE,
  location_id           BIGINT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  shop_id               BIGINT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,

  available             INTEGER NOT NULL DEFAULT 0,

  PRIMARY KEY (variant_id, location_id),

  -- Sanity to ensure multi-tenant alignment:
  CONSTRAINT chk_variant_inventory_shop_consistent
    CHECK (shop_id > 0)
);

CREATE INDEX IF NOT EXISTS idx_variant_inventory_levels_shop_location
  ON variant_inventory_levels (shop_id, location_id, available);

CREATE INDEX IF NOT EXISTS idx_variant_inventory_levels_shop_variant
  ON variant_inventory_levels (shop_id, variant_id);

COMMIT;