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
  10
);

const STATIC_PATH =
  process.env.NODE_ENV === "production"
    ? `${process.cwd()}/frontend/dist`
    : `${process.cwd()}/frontend/`;

// ✅ Express app
const app = express();

// ✅ Simple runtime DB test – runs once when server starts
async function testDbConnection() {
  try {
    await prisma.$connect();
    console.log("✅ Supabase DB OK. Prisma connected.");
  } catch (error) {
    console.error("❌ Supabase DB FAILED:", error);
  }
}

/* ────────────────────────────────────────────── */
/* Shopify authentication + webhooks              */
/* ────────────────────────────────────────────── */
app.get(shopify.config.auth.path, shopify.auth.begin());

app.get(
  shopify.config.auth.callbackPath,
  shopify.auth.callback(),
  shopify.redirectToShopifyOrAppRoot()
);

app.post(
  shopify.config.webhooks.path,
  shopify.processWebhooks({ webhookHandlers: PrivacyWebhookHandlers })
);

/* ────────────────────────────────────────────── */
/* API auth middleware                            */
/* ────────────────────────────────────────────── */
app.use("/api/*", shopify.validateAuthenticatedSession());
app.use(express.json());

/* ────────────────────────────────────────────── */
/* Minimal GraphQL endpoint for bootstrapProducts */
/* ────────────────────────────────────────────── */
app.post("/api/graphql", async (req, res) => {
  try {
    const session = res.locals.shopify.session;
    if (!session) {
      return res.status(401).json({
        errors: [{ message: "Unauthenticated" }],
      });
    }

    const { query, variables } = req.body ?? {};
    if (!query || typeof query !== "string") {
      return res.status(400).json({
        errors: [{ message: "Missing GraphQL query" }],
      });
    }

    // Handle only bootstrapProducts for now (enough for ProductsPage)
    if (query.includes("bootstrapProducts")) {
      const first = variables?.first ?? 25;
      const after = variables?.after ?? null;

      const client = new shopify.api.clients.Graphql({ session });

      // NOTE: Product has NO `hasImages` field in Admin API.
      // We query images(first: 1) and compute hasImages in Node.
      const shopifyResp = await client.request(
        `
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
                images(first: 1) {
                  edges {
                    node {
                      id
                    }
                  }
                }
                updatedAt
              }
            }
          }
        }
        `,
        { first, after }
      );

      const edges = shopifyResp?.data?.products?.edges ?? [];

      const items = edges.map((edge) => {
        const p = edge.node;
        const imageEdges = p.images?.edges ?? [];
        const hasImages = imageEdges.length > 0;

        return {
          id: p.id,
          title: p.title,
          handle: p.handle,
          status: p.status,
          vendor: p.vendor,
          productType: p.productType,
          tags: p.tags ?? [],
          hasImages,
          updatedAtShopify: p.updatedAt,
        };
      });

      const nextCursor =
        edges.length > 0 ? edges[edges.length - 1].cursor : null;

      // Shape expected by BOOTSTRAP_PRODUCTS_QUERY typings:
      // bootstrapProducts { status { fastReady fastLastSyncAt fastRevision syncEnqueued } page { items nextCursor } }
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

    // Anything else is not implemented yet
    return res.status(400).json({
      errors: [{ message: "Unknown GraphQL operation" }],
    });
  } catch (err) {
    console.error("POST /api/graphql failed:", err);
    return res.status(500).json({
      errors: [{ message: "Internal server error" }],
    });
  }
});

/* ────────────────────────────────────────────── */
/* Existing REST endpoints                         */
/* ────────────────────────────────────────────── */
app.get("/api/products/count", async (_req, res) => {
  const client = new shopify.api.clients.Graphql({
    session: res.locals.shopify.session,
  });

  const countData = await client.request(`
    query shopifyProductCount {
      productsCount {
        count
      }
    }
  `);

  res.status(200).send({ count: countData.data.productsCount.count });
});

app.post("/api/products", async (_req, res) => {
  let status = 200;
  let error = null;

  try {
    await productCreator(res.locals.shopify.session);
    } catch (e) {
    console.log(`Failed to process products/create: ${e.message}`);
    status = 500;
    error = e.message;
  }

  res.status(status).send({ success: status === 200, error });
});

/* ────────────────────────────────────────────── */
/* CSP + Frontend static + catch-all               */
/* ────────────────────────────────────────────── */
app.use(shopify.cspHeaders());
app.use(serveStatic(STATIC_PATH, { index: false }));

// IMPORTANT: Catch-all must be LAST
app.use("/*", shopify.ensureInstalledOnShop(), async (_req, res) => {
  return res
    .status(200)
    .set("Content-Type", "text/html")
    .send(
      readFileSync(join(STATIC_PATH, "index.html"))
        .toString()
        .replace("%VITE_SHOPIFY_API_KEY%", process.env.SHOPIFY_API_KEY || "")
    );
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  testDbConnection();
});
