-- FILE: web/db/postgres/migrations/002_jobs_and_sync.sql

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- Enums
-- ─────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'job_status') THEN
    CREATE TYPE job_status AS ENUM (
      'pending',   -- created but not queued
      'queued',    -- in queue, waiting for worker
      'running',   -- actively being processed
      'completed', -- finished successfully
      'failed',    -- terminal failure
      'canceled'   -- canceled by user/system
    );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'edit_type') THEN
    CREATE TYPE edit_type AS ENUM (
      'manual',      -- user clicked run now
      'scheduled',   -- one-time scheduled bulk job
      'recurring'    -- recurring bulk job
    );
  END IF;
END$$;

-- ─────────────────────────────────────────────────────────────
-- BULK JOBS
--
--  - One row per bulk edit job (product/variant/inventory edits)
--  - Supports:
--      * per-shop concurrency
--      * idempotency key
--      * recurring jobs (next_run_at)
--      * stuck-job reaper via locked_at/status
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bulk_jobs (
  id              BIGSERIAL PRIMARY KEY,

  shop_id         BIGINT      NOT NULL REFERENCES shops(id) ON DELETE CASCADE,

  -- Logical type of bulk job, e.g.:
  --  "PRODUCT_BULK_EDIT", "INVENTORY_BULK_EDIT", "PRICE_BULK_EDIT"
  job_type        TEXT        NOT NULL,

  -- Status lifecycle
  status          job_status  NOT NULL DEFAULT 'pending',

  -- Execution metadata
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  queued_at       TIMESTAMPTZ,
  started_at      TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ,

  -- Scheduling / recurring support
  is_recurring    BOOLEAN     NOT NULL DEFAULT FALSE,
  schedule_cron   TEXT,                -- optional cron expression for recurring jobs
  schedule_tz     TEXT,                -- timezone for cron evaluation
  next_run_at     TIMESTAMPTZ,         -- when this job should next be picked up
  last_run_at     TIMESTAMPTZ,
  run_count       INTEGER     NOT NULL DEFAULT 0,

  -- Concurrency / locking
  locked_by       TEXT,                -- worker id / hostname
  locked_at       TIMESTAMPTZ,
  lock_expires_at TIMESTAMPTZ,         -- optional, for lease-based locking
  attempt         INTEGER     NOT NULL DEFAULT 0,
  max_attempts    INTEGER     NOT NULL DEFAULT 3,

  -- Idempotency: run-now dedupe or retry safety
  -- (unique per shop for non-null values)
  idempotency_key TEXT,

  -- High-level path / context (e.g., which UI/feature initiated it)
  -- useful for debugging + grouping in history
  source_path     TEXT,

  -- Input configuration snapshot (immutable)
  input_filters   JSONB,               -- DSL filter config at time of creation
  input_payload   JSONB,               -- fields to edit, options, etc.
  input_meta      JSONB,               -- extra metadata (user id, locale, etc.)

  -- Execution statistics
  stats           JSONB,               -- { totalRows, processed, succeeded, failed, ... }

  -- Error / cancellation details
  error_summary   TEXT,
  error_details   JSONB,
  canceled_at     TIMESTAMPTZ,
  cancel_reason   TEXT,

  -- Optimistic concurrency control
  version         BIGINT      NOT NULL DEFAULT 0
);

-- Indexes for per-shop dashboards / reapers
CREATE INDEX IF NOT EXISTS idx_bulk_jobs_shop_status_created
  ON bulk_jobs (shop_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bulk_jobs_shop_next_run_status
  ON bulk_jobs (shop_id, status, next_run_at);

CREATE INDEX IF NOT EXISTS idx_bulk_jobs_shop_locked_status
  ON bulk_jobs (shop_id, status, locked_at);

-- Idempotency: unique per shop for non-null keys
CREATE UNIQUE INDEX IF NOT EXISTS uidx_bulk_jobs_shop_idempotency
  ON bulk_jobs (shop_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- EXPORT JOBS
--
--  - One row per export (products/variants/inventory/etc.)
--  - Responsible for CSV/Excel/JSON exports
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS export_jobs (
  id              BIGSERIAL PRIMARY KEY,

  shop_id         BIGINT      NOT NULL REFERENCES shops(id) ON DELETE CASCADE,

  -- e.g. "PRODUCT_EXPORT", "VARIANT_EXPORT", "INVENTORY_EXPORT"
  export_type     TEXT        NOT NULL,

  status          job_status  NOT NULL DEFAULT 'pending',

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  queued_at       TIMESTAMPTZ,
  started_at      TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ,

  -- Filters + config snapshot at job creation
  filter_snapshot JSONB,               -- DSL filters
  column_config   JSONB,               -- which columns to include
  options         JSONB,               -- format, compression, locale, etc.

  -- Destination / file metadata
  destination_type TEXT,               -- "download", "email", "gdrive", etc.
  file_path        TEXT,               -- path or URL where the file is stored
  file_format      TEXT,               -- "csv", "xlsx", "json"
  file_size_bytes  BIGINT,

  -- Stats
  stats           JSONB,               -- { totalRows, writtenRows, ... }
  row_count       BIGINT,

  -- Error / cancellation
  error_summary   TEXT,
  error_details   JSONB,
  canceled_at     TIMESTAMPTZ,
  cancel_reason   TEXT,

  -- Idempotency: dedupe "same export" within a shop if you want
  idempotency_key TEXT,

  version         BIGINT      NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_export_jobs_shop_status_created
  ON export_jobs (shop_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_export_jobs_shop_idempotency
  ON export_jobs (shop_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- IMPORT JOBS
--
--  - One row per CSV/import job
--  - Feeds product/inventory updates via workers
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS import_jobs (
  id               BIGSERIAL PRIMARY KEY,

  shop_id          BIGINT      NOT NULL REFERENCES shops(id) ON DELETE CASCADE,

  -- e.g. "PRODUCT_IMPORT", "INVENTORY_IMPORT"
  import_type      TEXT        NOT NULL,

  status           job_status  NOT NULL DEFAULT 'pending',

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  queued_at        TIMESTAMPTZ,
  started_at       TIMESTAMPTZ,
  finished_at      TIMESTAMPTZ,

  -- Source file info
  source_type      TEXT,                -- "upload", "gdrive", "url"
  source_path      TEXT,                -- file path or URL
  source_mime_type TEXT,
  source_size_bytes BIGINT,

  -- Parsed CSV configuration
  parser_config    JSONB,               -- delimiter, header row, encoding, etc.
  mapping_config   JSONB,               -- column → field mapping snapshot
  options          JSONB,               -- dry-run, stopOnError, etc.

  -- Stats
  stats            JSONB,               -- { parsed, applied, failed, skipped, ... }
  parsed_rows      BIGINT,
  applied_rows     BIGINT,
  failed_rows      BIGINT,

  -- Error / cancellation
  error_summary    TEXT,
  error_details    JSONB,
  canceled_at      TIMESTAMPTZ,
  cancel_reason    TEXT,

  -- Idempotency: avoid duplicate imports for same file+config
  idempotency_key  TEXT,

  version          BIGINT      NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_import_jobs_shop_status_created
  ON import_jobs (shop_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_import_jobs_shop_idempotency
  ON import_jobs (shop_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- SYNC HISTORY
--
--  - One row per Shopify bulk operation / sync run
--  - Covers products, variants, inventory, etc.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sync_history (
  id                  BIGSERIAL PRIMARY KEY,

  shop_id             BIGINT      NOT NULL REFERENCES shops(id) ON DELETE CASCADE,

  -- e.g. "PRODUCTS", "VARIANTS", "INVENTORY", "PRODUCTS_AND_VARIANTS"
  resource_type       TEXT        NOT NULL,

  -- reuse job_status for lifecycle: pending/running/completed/failed/canceled
  status              job_status  NOT NULL DEFAULT 'pending',

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at          TIMESTAMPTZ,
  finished_at         TIMESTAMPTZ,

  -- Shopify bulk operation info
  bulk_operation_id   TEXT,       -- Shopify BulkOperation GID
  bulk_operation_status TEXT,     -- raw status from Shopify (optional)
  bulk_operation_url  TEXT,       -- URL of JSONL result
  bulk_operation_error TEXT,      -- error message from Shopify (if any)

  -- Progress counters
  expected_records    BIGINT,
  processed_records   BIGINT,
  succeeded_records   BIGINT,
  failed_records      BIGINT,

  -- For streaming JSONL
  last_cursor         TEXT,       -- last processed line / cursor
  last_error          TEXT,

  -- Extra context
  meta                JSONB       -- { triggeredBy: "manual|webhook|cron", etc. }
);

CREATE INDEX IF NOT EXISTS idx_sync_history_shop_res_created
  ON sync_history (shop_id, resource_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sync_history_shop_status_created
  ON sync_history (shop_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_sync_history_shop_bulk_id
  ON sync_history (shop_id, bulk_operation_id)
  WHERE bulk_operation_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- EDIT HISTORY (AUDIT TRAIL)
--
--  - One row per field change (product or variant)
--  - Can be linked to bulk_jobs/import_jobs/etc. by job_id
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS edit_history (
  id                  BIGSERIAL PRIMARY KEY,

  shop_id             BIGINT      NOT NULL REFERENCES shops(id) ON DELETE CASCADE,

  -- optional link back to bulk job (or import job) that caused this change
  bulk_job_id         BIGINT      REFERENCES bulk_jobs(id) ON DELETE SET NULL,
  import_job_id       BIGINT      REFERENCES import_jobs(id) ON DELETE SET NULL,

  -- product / variant references (by Shopify id, not mirror PK)
  shopify_product_id  BIGINT,
  shopify_variant_id  BIGINT,

  -- which plane we edited: "PRODUCT", "VARIANT", "INVENTORY", etc.
  target_level        TEXT        NOT NULL,

  field               TEXT        NOT NULL,  -- e.g. "price", "title", "seo.title"
  old_value           TEXT,
  new_value           TEXT,

  edit_type           edit_type   NOT NULL,  -- manual / scheduled / recurring

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Optional JSON for extra context (user id, request id, etc.)
  meta                JSONB
);

CREATE INDEX IF NOT EXISTS idx_edit_history_shop_created
  ON edit_history (shop_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_edit_history_shop_product
  ON edit_history (shop_id, shopify_product_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_edit_history_shop_variant
  ON edit_history (shop_id, shopify_variant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_edit_history_shop_bulk_job
  ON edit_history (shop_id, bulk_job_id, created_at DESC);

COMMIT;