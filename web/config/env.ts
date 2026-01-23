// web/config/env.ts
import dotenv from "dotenv";

dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: requireEnv("DATABASE_URL"),
  shopifyApiKey: requireEnv("SHOPIFY_API_KEY"),
  shopifyApiSecret: requireEnv("SHOPIFY_API_SECRET"),
  shopifyScopes: requireEnv("SHOPIFY_SCOPES"),
  shopifyAppUrl: requireEnv("SHOPIFY_APP_URL"),
};
