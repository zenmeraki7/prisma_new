// web/index.js
import "dotenv/config"; // MUST be first
import { join } from "path";
import { readFileSync } from "fs";
import express from "express";
import serveStatic from "serve-static";

import shopify from "./shopify.js";
import productCreator from "./product-creator.js";
import PrivacyWebhookHandlers from "./privacy.js";
import { prisma } from "./db/prisma.js";

const PORT = parseInt(
  process.env.BACKEND_PORT || process.env.PORT || "3000",
  10,
);

const STATIC_PATH =
  process.env.NODE_ENV === "production"
    ? `${process.cwd()}/frontend/dist`
    : `${process.cwd()}/frontend/`;

// ──────────────────────────────────────────────
// Express app
// ──────────────────────────────────────────────
const app = express();
app.use(express.json());

// ──────────────────────────────────────────────
// Runtime DB test
// ──────────────────────────────────────────────
async function testDbConnection() {
  try {
    await prisma.$connect();
    console.log("✅ Database connected via Prisma");
  } catch (error) {
    console.error("❌ Database connection failed:", error);
  }
}

// ──────────────────────────────────────────────
// Shopify authentication + webhooks
// ──────────────────────────────────────────────
app.get(shopify.config.auth.path, shopify.auth.begin());

app.get(
  shopify.config.auth.callbackPath,
  shopify.auth.callback(),
  shopify.redirectToShopifyOrAppRoot(),
);

app.post(
  shopify.config.webhooks.path,
  shopify.processWebhooks({ webhookHandlers: PrivacyWebhookHandlers }),
);

// ──────────────────────────────────────────────
// API auth middleware
// ──────────────────────────────────────────────
app.use("/api/*", shopify.validateAuthenticatedSession());

// ──────────────────────────────────────────────
// GRAPHQL API (Frontend talks to this)
// ──────────────────────────────────────────────
app.post("/api/graphql", async (req, res) => {
  try {
    const session = res.locals.shopify?.session;
    if (!session) {
      return res.status(401).json({
        errors: [{ message: "Unauthenticated" }],
      });
    }

    const { query, variables } = req.body || {};
    if (!query || typeof query !== "string") {
      return res.status(400).json({
        errors: [{ message: "Missing GraphQL query" }],
      });
    }

    console.log("➡️ Incoming GraphQL operation");

    // ──────────────────────────────────────────
    // Handle bootstrapProducts (Products Page)
    // ──────────────────────────────────────────
    if (query.includes("bootstrapProducts")) {
      const first = Number(variables?.first ?? 25);
      const after = variables?.after ?? null;

      const client = new shopify.api.clients.Graphql({ session });

      const shopifyQuery = `
        query BootstrapProducts($first: Int!, $after: String) {
          products(first: $first, after: $after) {
            edges {
              cursor
              node {
                id
                title
                handle
                status
                vendor
                productType
                tags
                updatedAt
                images(first: 1) {
                  edges {
                    node {
                      id
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const response = await client.request(shopifyQuery, {
        variables: { first, after },
      });

      const edges = response?.data?.products?.edges || [];

      const items = edges.map((edge) => {
        const p = edge.node;
        const hasImages = (p.images?.edges?.length || 0) > 0;

        return {
          id: p.id,
          title: p.title,
          handle: p.handle,
          status: p.status,
          vendor: p.vendor,
          productType: p.productType,
          tags: p.tags || [],
          hasImages,
          updatedAtShopify: p.updatedAt,
        };
      });

      const nextCursor =
        edges.length > 0 ? edges[edges.length - 1].cursor : null;

      console.log(`✅ Returned ${items.length} products`);

      return res.json({
        data: {
          bootstrapProducts: {
            status: {
              fastReady: true,
              syncEnqueued: false,
              fastLastSyncAt: new Date().toISOString(),
              fastRevision: 1,
            },
            page: {
              items,
              nextCursor,
            },
          },
        },
      });
    }

    // ──────────────────────────────────────────
    // Unknown operation
    // ──────────────────────────────────────────
    return res.status(400).json({
      errors: [{ message: "Unsupported GraphQL operation" }],
    });
  } catch (error) {
    console.error("❌ /api/graphql error:", error);

    return res.status(500).json({
      errors: [
        {
          message: "GraphQL server error",
          details: error.message,
        },
      ],
    });
  }
});

// ──────────────────────────────────────────────
// Existing REST APIs
// ──────────────────────────────────────────────
app.get("/api/products/count", async (_req, res) => {
  try {
    const client = new shopify.api.clients.Graphql({
      session: res.locals.shopify.session,
    });

    const result = await client.request(`
      query {
        productsCount {
          count
        }
      }
    `);

    res.status(200).send({
      count: result.data.productsCount.count,
    });
  } catch (err) {
    console.error("❌ Count error:", err);
    res.status(500).send({ error: "Failed to fetch product count" });
  }
});

app.post("/api/products", async (_req, res) => {
  let status = 200;
  let error = null;

  try {
    await productCreator(res.locals.shopify.session);
  } catch (e) {
    console.error("❌ Product create failed:", e.message);
    status = 500;
    error = e.message;
  }

  res.status(status).send({ success: status === 200, error });
});

// ──────────────────────────────────────────────
// CSP + Static frontend
// ──────────────────────────────────────────────
app.use(shopify.cspHeaders());
app.use(serveStatic(STATIC_PATH, { index: false }));

// Catch-all — MUST be last
app.use("/*", shopify.ensureInstalledOnShop(), async (_req, res) => {
  return res
    .status(200)
    .set("Content-Type", "text/html")
    .send(
      readFileSync(join(STATIC_PATH, "index.html"))
        .toString()
        .replace("%VITE_SHOPIFY_API_KEY%", process.env.SHOPIFY_API_KEY || ""),
    );
});

// ──────────────────────────────────────────────
// Start server
// ──────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  testDbConnection();
});
