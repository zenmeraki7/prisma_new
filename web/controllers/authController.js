// FILE: web/controllers/authController.js
import { pool } from "../db/postgres/pool.js";
import { shopify } from "../shopify.js";
import { primeShopSessionCache } from "../services/shopify/shopSessionService.pg.js";

export async function authCallback(req, res, next) {
  try {
    const session = await shopify.auth.callback({
      rawRequest: req,
      rawResponse: res,
    });

    const shopDomain = session.shop;
    const accessToken = session.accessToken;
    const apiVersion = shopify.config.apiVersion;

    const upsertSql = `
      INSERT INTO shops (shop_domain, access_token, api_version, uninstalled_at, updated_at)
      VALUES ($1, $2, $3, NULL, NOW())
      ON CONFLICT (shop_domain)
      DO UPDATE SET
        access_token = EXCLUDED.access_token,
        api_version  = EXCLUDED.api_version,
        uninstalled_at = NULL,
        updated_at   = NOW()
      RETURNING id
    `;

    const { rows } = await pool.query(upsertSql, [
      shopDomain,
      accessToken,
      apiVersion,
    ]);

    const shopId = rows[0].id;

    // Optional cache warm
    primeShopSessionCache({
      shopId,
      shopDomain,
      accessToken,
      apiVersion,
    });

    // Attach to whatever session you use for your app
    // e.g. res.locals.shopId = shopId; or store in your own app session
    // then redirect into embedded app
    return shopify.redirectToShopifyOrAppRoot()(req, res);
  } catch (err) {
    next(err);
  }
}