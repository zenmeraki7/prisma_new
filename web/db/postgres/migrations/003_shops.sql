-- FILE: web/db/postgres/migrations/003_shops.sql

BEGIN;

CREATE TABLE IF NOT EXISTS shops (
  id              BIGSERIAL PRIMARY KEY,
  shop_domain     TEXT NOT NULL UNIQUE,
  -- offline token for admin API
  access_token    TEXT NOT NULL,
  api_version     TEXT NOT NULL DEFAULT '2024-01',

  -- optional metadata
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- track billing / plan if you want
  plan_name       TEXT,
  plan_display    TEXT,

  -- soft delete / uninstall
  uninstalled_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS shops_shop_domain_idx ON shops (shop_domain);

COMMIT;