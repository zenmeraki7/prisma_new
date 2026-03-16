// FILE: frontend/lib/bulkEditApi.ts

export type BulkEditScope = "PRODUCT" | "VARIANT";
export type BulkEditAction = "SET";

export type BulkEditFieldKey =
  | "product.title"
  | "product.vendor"
  | "product.productType"
  | "product.tags"
  | "variant.price"
  | "variant.compareAtPrice"
  | "variant.sku"
  | "variant.barcode";

export type BulkEditJobStatus =
  | "QUEUED"
  | "BUILDING"
  | "UPLOADING"
  | "SUBMITTED"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export interface FilterExpr {
  kind: "group" | "field";
  op?: string;
  key?: string;
  value?: unknown;
  children?: FilterExpr[];
}

export interface CreateBulkEditJobRequest {
  scope: BulkEditScope;
  fieldKey: BulkEditFieldKey;
  action: BulkEditAction;
  value: unknown;
  filterExpr: FilterExpr;
}

export interface BulkEditJobItem {
  id: string;
  jobId: string;
  inputLineNumber?: number | null;
  productId?: string | null;
  productGid?: string | null;
  variantId?: string | null;
  variantGid?: string | null;
  inputJson?: unknown;
  resultJson?: unknown;
  userErrorsJson?: unknown;
  success?: boolean | null;
  errorMessage?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface BulkEditJob {
  id: string;
  shopId: string;
  status: BulkEditJobStatus;
  scope: BulkEditScope;
  action: BulkEditAction;
  fieldKey: BulkEditFieldKey | string;
  mutationName: string;
  selectionMode?: string | null;

  selectedCount?: number | null;
  inputLineCount?: number | null;
  objectCount?: number | null;

  errorCode?: string | null;
  errorMessage?: string | null;

  resultUrl?: string | null;
  partialDataUrl?: string | null;
  bulkOperationId?: string | null;
  
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;

    editPayloadJson?: {
    value?: unknown;
  } | null;

  items?: BulkEditJobItem[];
}




export interface CreateBulkEditJobResponse {
  ok: boolean;
  job: {
    id: string;
    status: BulkEditJobStatus;
    scope: BulkEditScope;
    action: BulkEditAction;
    fieldKey: BulkEditFieldKey | string;
    mutationName: string;
    selectionMode?: string | null;
  };
}

export interface GetBulkEditJobResponse {
  ok: boolean;
  job: BulkEditJob;
}

export interface RetryFailedBulkEditJobResponse {
  ok: boolean;
  retryJob: {
    id: string;
    sourceJobId: string;
    selectionMode: string;
    retryCount: number;
  };
}


export interface BulkEditPreset {
  id: string;
  name: string;
  description?: string | null;
  scope: BulkEditScope;
  fieldKey: BulkEditFieldKey | string;
  action: BulkEditAction;
  valueJson: unknown;
  filterExprJson: FilterExpr;
  isFavorite: boolean;
  isArchived?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ListBulkEditPresetsResponse {
  ok: boolean;
  presets: BulkEditPreset[];
}

export interface GetBulkEditPresetResponse {
  ok: boolean;
  preset: BulkEditPreset;
}

async function parseJsonSafely(response: Response): Promise<any> {
  const text = await response.text();

  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {
      ok: false,
      error: text || `HTTP ${response.status}`,
    };
  }
}

async function request<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    credentials: "same-origin",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  const data = await parseJsonSafely(response);

  if (!response.ok) {
    throw new Error(data?.error || `Request failed with status ${response.status}`);
  }

  if (data?.ok === false) {
    throw new Error(data?.error || "Request failed");
  }

  return data as T;
}

export async function createBulkEditJob(
  payload: CreateBulkEditJobRequest,
): Promise<CreateBulkEditJobResponse> {
  return request<CreateBulkEditJobResponse>("/api/bulk-edit/jobs", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getBulkEditJob(jobId: string): Promise<GetBulkEditJobResponse> {
  return request<GetBulkEditJobResponse>(`/api/bulk-edit/jobs/${encodeURIComponent(jobId)}`, {
    method: "GET",
    headers: {},
  });
}

export async function retryFailedBulkEditJob(
  jobId: string,
): Promise<RetryFailedBulkEditJobResponse> {
  return request<RetryFailedBulkEditJobResponse>(
    `/api/bulk-edit/jobs/${encodeURIComponent(jobId)}/retry-failed`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
}

export function getBulkEditFailuresCsvUrl(jobId: string): string {
  return `/api/bulk-edit/jobs/${encodeURIComponent(jobId)}/failures.csv`;
}

export function isBulkEditTerminalStatus(status?: BulkEditJobStatus | null): boolean {
  return status === "COMPLETED" || status === "FAILED" || status === "CANCELLED";
}

export function getBulkEditStatusTone(
  status?: BulkEditJobStatus | null,
): "success" | "critical" | "warning" | "attention" | "info" | undefined {
  switch (status) {
    case "COMPLETED":
      return "success";
    case "FAILED":
    case "CANCELLED":
      return "critical";
    case "UPLOADING":
    case "SUBMITTED":
    case "RUNNING":
      return "attention";
    case "QUEUED":
    case "BUILDING":
      return "info";
    default:
      return undefined;
  }
}

export function getBulkEditFieldLabel(fieldKey: string): string {
  const labels: Record<string, string> = {
    "product.title": "Product title",
    "product.vendor": "Vendor",
    "product.productType": "Product type",
    "product.tags": "Tags",
    "variant.price": "Variant price",
    "variant.compareAtPrice": "Variant compare-at price",
    "variant.sku": "Variant SKU",
    "variant.barcode": "Variant barcode",
  };

  return labels[fieldKey] || fieldKey;
}

export function getBulkEditScopeLabel(scope: BulkEditScope): string {
  return scope === "PRODUCT" ? "Products" : "Variants";
}


export interface ListBulkEditJobsResponse {
  ok: boolean;
  jobs: BulkEditJob[];
}

export async function listBulkEditJobs(take = 20): Promise<ListBulkEditJobsResponse> {
  return request<ListBulkEditJobsResponse>(
    `/api/bulk-edit/jobs?take=${encodeURIComponent(String(take))}`,
    {
      method: "GET",
      headers: {},
    },
  );
}

export async function listBulkEditPresets(): Promise<ListBulkEditPresetsResponse> {
  return request<ListBulkEditPresetsResponse>("/api/bulk-edit/presets", {
    method: "GET",
    headers: {},
  });
}

export async function createBulkEditPreset(payload: {
  name: string;
  description?: string;
  scope: BulkEditScope;
  fieldKey: BulkEditFieldKey;
  action: BulkEditAction;
  value: unknown;
  filterExpr: FilterExpr;
  isFavorite?: boolean;
}) {
  return request<{ ok: boolean; preset: BulkEditPreset }>("/api/bulk-edit/presets", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateBulkEditPreset(
  presetId: string,
  payload: Record<string, unknown>,
) {
  return request<{ ok: boolean; preset: BulkEditPreset }>(
    `/api/bulk-edit/presets/${encodeURIComponent(presetId)}`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
  );
}

export async function deleteBulkEditPreset(presetId: string) {
  return request<{ ok: boolean }>(
    `/api/bulk-edit/presets/${encodeURIComponent(presetId)}`,
    {
      method: "DELETE",
      body: JSON.stringify({}),
    },
);
};


export async function runBulkEditPreset(presetId: string) {
  return request<CreateBulkEditJobResponse>(
    `/api/bulk-edit/presets/${encodeURIComponent(presetId)}/run`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
}