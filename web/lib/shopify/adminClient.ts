// web/lib/shopify/adminClient.ts
type AdminGraphqlResponse<T> = { data?: T; errors?: any };

export async function shopifyAdminGraphql<T>(opts: {
  shop: string;
  accessToken: string;
  query: string;
  variables?: Record<string, any>;
}): Promise<T> {
  const res = await fetch(`https://${opts.shop}/admin/api/2025-01/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": opts.accessToken,
    },
    body: JSON.stringify({ query: opts.query, variables: opts.variables ?? {} }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify GraphQL HTTP ${res.status}: ${text}`);
  }

  const json = (await res.json()) as AdminGraphqlResponse<T>;
  if (json.errors?.length) {
    throw new Error(`Shopify GraphQL errors: ${JSON.stringify(json.errors)}`);
  }
  if (!json.data) {
    throw new Error("Shopify GraphQL: missing data");
  }
  return json.data;
}
