// FILE: web/services/shopify/stagedUpload.service.js

import { openAsBlob } from "node:fs";
import { stat } from "node:fs/promises";

import shopify from "../../../shopify.js";

const API_VERSION = process.env.SHOPIFY_ADMIN_API_VERSION || "2026-01";

const STAGED_UPLOADS_CREATE_MUTATION = `
mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
  stagedUploadsCreate(input: $input) {
    stagedTargets {
      url
      resourceUrl
      parameters {
        name
        value
      }
    }
    userErrors {
      field
      message
    }
  }
}
`;

async function getOfflineSessionOrThrow(shop) {
  const offlineId = shopify.api.session.getOfflineId(shop);
  const session = await shopify.sessionStorage.loadSession(offlineId);

  if (!session?.accessToken) {
    throw new Error(`Offline session not found for shop ${shop}`);
  }

  return session;
}

async function adminGraphqlRequest({ shop, query, variables }) {
  const session = await getOfflineSessionOrThrow(shop);

  const response = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": session.accessToken,
    },
    body: JSON.stringify({
      query,
      variables,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Shopify GraphQL HTTP ${response.status}: ${text}`);
  }

  const json = await response.json();

  if (json.errors?.length) {
    throw new Error(
      `Shopify GraphQL error: ${json.errors.map((e) => e.message).join("; ")}`,
    );
  }

  return json.data;
}

export async function createStagedUploadTarget({
  shop,
  filename,
  fileSizeBytes,
}) {
  const data = await adminGraphqlRequest({
    shop,
    query: STAGED_UPLOADS_CREATE_MUTATION,
    variables: {
      input: [
        {
          filename,
          mimeType: "text/jsonl",
          httpMethod: "POST",
          resource: "BULK_MUTATION_VARIABLES",
          fileSize: String(fileSizeBytes),
        },
      ],
    },
  });

  const payload = data?.stagedUploadsCreate;
  const userErrors = payload?.userErrors || [];

  if (userErrors.length > 0) {
    throw new Error(
      `stagedUploadsCreate failed: ${userErrors.map((e) => e.message).join("; ")}`,
    );
  }

  const target = payload?.stagedTargets?.[0];
  if (!target) {
    throw new Error("stagedUploadsCreate returned no staged target");
  }

  return target;
}

export async function uploadJsonlToStagedTarget({
  filePath,
  filename,
  target,
}) {
  const form = new FormData();

  for (const param of target.parameters || []) {
    form.append(param.name, param.value);
  }

  const file = await openAsBlob(filePath, { type: "text/jsonl" });
  form.append("file", file, filename);

  const response = await fetch(target.url, {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Staged upload failed with HTTP ${response.status}: ${text}`);
  }

  const keyParam = (target.parameters || []).find((p) => p.name === "key");
  if (!keyParam?.value) {
    throw new Error("Staged upload target missing 'key' parameter");
  }

  return {
    stagedUploadPath: keyParam.value,
    resourceUrl: target.resourceUrl,
  };
}

export async function createAndUploadBulkMutationJsonl({
  shop,
  filePath,
  filename,
}) {
  const stats = await stat(filePath);

  const target = await createStagedUploadTarget({
    shop,
    filename,
    fileSizeBytes: stats.size,
  });

  return uploadJsonlToStagedTarget({
    filePath,
    filename,
    target,
  });
}