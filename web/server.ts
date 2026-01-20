// web/server.ts
import express from "express";
import { createYoga } from "graphql-yoga";
import { schema } from "./graphql/schema";

const app = express();

// Shopify middleware should populate shop context (shopId/shopDomain/accessToken).
// For now, we show a hard fail if missing.
const yoga = createYoga({
  schema,
  context: ({ request }) => {
    // Replace with your actual session extraction.
    const shopId = request.headers.get("x-shop-id");
    const shopDomain = request.headers.get("x-shop-domain");
    const accessToken = request.headers.get("x-shop-token");

    if (!shopId || !shopDomain || !accessToken) {
      throw new Error("Missing shop context headers (x-shop-id, x-shop-domain, x-shop-token)");
    }

    return {
      shopId,
      shopDomain,
      accessToken,
    };
  },
});

app.use("/api/graphql", yoga);

app.get("/healthz", (_req, res) => res.status(200).send("ok"));

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`Server listening on :${port}`);
});
