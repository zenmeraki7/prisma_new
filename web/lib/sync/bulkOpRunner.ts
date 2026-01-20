// web/lib/sync/bulkOpRunner.ts
import { shopifyAdminGraphql } from "../shopify/adminClient";

const BULK_OP_RUN = `
mutation Run($query: String!) {
  bulkOperationRunQuery(query: $query) {
    bulkOperation { id status }
    userErrors { field message }
  }
}
`;

const BULK_OP_CURRENT = `
query Current {
  currentBulkOperation {
    id
    status
    errorCode
    objectCount
    url
    partialDataUrl
    createdAt
    completedAt
  }
}
`;

export type BulkOpStatus = {
  status: string;
  url: string | null;
  errorCode: string | null;
};

export async function startBulkOp(args: {
  shop: string;
  accessToken: string;
  query: string;
}): Promise<void> {
  const data = await shopifyAdminGraphql<any>({
    shop: args.shop,
    accessToken: args.accessToken,
    query: BULK_OP_RUN,
    variables: { query: args.query },
  });

  const errs = data?.bulkOperationRunQuery?.userErrors ?? [];
  if (errs.length) throw new Error(`BulkOp userErrors: ${JSON.stringify(errs)}`);
}

export async function pollBulkOpUntilUrl(args: {
  shop: string;
  accessToken: string;
  timeoutMs?: number;
}): Promise<string> {
  const timeoutMs = args.timeoutMs ?? 15 * 60 * 1000;
  const start = Date.now();

  while (true) {
    const data = await shopifyAdminGraphql<any>({
      shop: args.shop,
      accessToken: args.accessToken,
      query: BULK_OP_CURRENT,
    });

    const cur = data?.currentBulkOperation as any;
    const status = String(cur?.status ?? "UNKNOWN");
    const url = (cur?.url as string | null) ?? null;
    const errorCode = (cur?.errorCode as string | null) ?? null;

    if (errorCode) throw new Error(`BulkOp errorCode=${errorCode}`);
    if (status === "COMPLETED" && url) return url;
    if (status === "FAILED" || status === "CANCELED") {
      throw new Error(`BulkOp status=${status}`);
    }

    if (Date.now() - start > timeoutMs) throw new Error("BulkOp timeout");
    await new Promise((r) => setTimeout(r, 2000));
  }
}

export async function* streamJsonl(url: string): AsyncGenerator<any> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`JSONL fetch failed: ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");

  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      yield JSON.parse(line);
    }
  }
  if (buf.trim()) yield JSON.parse(buf.trim());
}
