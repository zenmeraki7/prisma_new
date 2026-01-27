// web/graphql/export/resolvers.ts
//
// GraphQL resolvers for Export jobs.
//
// Responsibilities:
//  - Enforce multi-tenant scoping via context.shopId.
//  - Implement cursor-based pagination for exportJobs.
//  - Map Prisma ExportJob rows to GraphQL ExportJob DTOs via a single mapper.
//  - Create/reset jobs and enqueue FAST or BulkOps workers.
//  - Keep GraphQL ExportJob shape identical regardless of engine.
//  - Choose engine based on scope + estimated size, with optional hints.
//

import type {
  ExportJob as ExportJobModel,
  ExportScope as PrismaExportScope,
} from "@prisma/client";
import type { GraphQLContext } from "../schema";

import {
  exportQueue,
  type ExportJobPayload,
} from "../../lib/jobs/queues/exportQueue";

import {
  exportBulkOpsQueue,
  type BulkExportJobPayload,
} from "../../lib/jobs/queues/exportBulkOpsQueue";

import type {
  ExportStatusGql,
  ExportFormatGql,
  ExportScopeGql,
} from "../../shared/export/types";

import {
  prismaStatusToGql, // used indirectly via mapper (imported for completeness)
  prismaFormatToGql,
  prismaScopeToGql,
  gqlStatusToPrisma,
  gqlFormatToPrisma,
  gqlScopeToPrisma,
} from "../../shared/export/prismaMapping";

import { mapExportJobToGqlDto } from "../../shared/export/gqlMapper";

/* ========================================================================== *
 * Helper types
 * ========================================================================== */

interface StartExportJobInput {
  name: string;
  format: ExportFormatGql;
  scope: ExportScopeGql;
  fieldKeys: string[];
  planHash?: string | null;
  filterJson?: unknown;
  selectedProductIds?: string[] | null;
  /**
   * Optional engine hint for debugging / forcing a path.
   * If omitted, engine is chosen based on scope + estimated size.
   */
  engineHint?: "FAST" | "BULK_OPS" | null;
}

interface StartExportJobArgs {
  input: StartExportJobInput;
}

interface ExportJobsFilterInput {
  status?: ExportStatusGql | null;
  format?: ExportFormatGql | null;
  query?: string | null;
}

interface ExportJobsArgs {
  first: number;
  after?: string | null;
  filter?: ExportJobsFilterInput | null;
}

interface ExportJobArgs {
  id: string;
}

interface RetryExportJobArgs {
  id: string;
}

/* ========================================================================== *
 * Cursor helpers
 * ========================================================================== */

type ExportJobCursorPayload = {
  createdAt: string; // ISO string
  id: string; // BigInt as string
};

function encodeCursor(job: ExportJobModel): string {
  const payload: ExportJobCursorPayload = {
    createdAt: job.createdAt.toISOString(),
    id: job.id.toString(),
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

function decodeCursor(cursor: string): { createdAt: Date; id: bigint } {
  let parsed: ExportJobCursorPayload;

  try {
    const json = Buffer.from(cursor, "base64").toString("utf8");
    parsed = JSON.parse(json) as ExportJobCursorPayload;
  } catch {
    throw new Error("Invalid cursor");
  }

  if (!parsed.createdAt || !parsed.id) {
    throw new Error("Invalid cursor payload");
  }

  return {
    createdAt: new Date(parsed.createdAt),
    id: BigInt(parsed.id),
  };
}

function parseBigIntId(id: string): bigint {
  try {
    return BigInt(id);
  } catch {
    throw new Error("Invalid ID");
  }
}

function BigIntSafe(raw: string): bigint | null {
  if (!/^[0-9]+$/.test(raw)) return null;
  try {
    return BigInt(raw);
  } catch {
    return null;
  }
}

/* ========================================================================== *
 * Engine choice (FAST vs BulkOps)
 * ========================================================================== */

/**
 * Estimate export size based on scope and available counts.
 * Uses:
 *  - productLite.count for ALL
 *  - snapshotProduct.count for FILTERED (latest completed snapshot)
 *  - selectedProductIds.length for SELECTED
 */
async function estimateExportRecordCount(args: {
  prisma: GraphQLContext["prisma"];
  shopId: number;
  scope: PrismaExportScope;
  selectedProductIds?: string[] | null;
  planHash?: string | null;
}): Promise<number> {
  const { prisma, shopId, scope, selectedProductIds, planHash } = args;

  if (scope === "SELECTED") {
    return selectedProductIds?.length ?? 0;
  }

  if (scope === "ALL") {
    return prisma.productLite.count({
      where: { shopId },
    });
  }

  if (scope === "FILTERED" && planHash) {
    const snapshotRun = await prisma.snapshotRun.findFirst({
      where: {
        shopId,
        planHash,
        status: "COMPLETED",
      },
      orderBy: { completedAt: "desc" },
    });

    if (!snapshotRun) return 0;

    return prisma.snapshotProduct.count({
      where: { snapshotRunId: snapshotRun.id },
    });
  }

  return 0;
}

const BULK_OPS_THRESHOLD = 5_000;

type EngineKind = "FAST" | "BULK_OPS";

/**
 * Decide which engine to use for this export.
 *  - "FAST": product_lite / variant_rollup path.
 *  - "BULK_OPS": Shopify Bulk Operation JSONL path.
 *
 * Rules:
 *  - SELECTED: always FAST (BulkOps cannot handle arbitrary GID lists).
 *  - engineHint:
 *      - If provided and valid, respected, but clamped so SELECTED never uses BULK_OPS.
 *  - ALL / FILTERED:
 *      - Use BULK_OPS if estimated record count >= BULK_OPS_THRESHOLD.
 *      - Otherwise FAST is fine.
 */
async function chooseExportEngine(args: {
  prisma: GraphQLContext["prisma"];
  shopId: number;
  scope: PrismaExportScope;
  selectedProductIds?: string[] | null;
  planHash?: string | null;
  engineHint?: EngineKind | null;
}): Promise<EngineKind> {
  const { prisma, shopId, scope, selectedProductIds, planHash, engineHint } =
    args;

  // Hard rule: SELECTED can never use BulkOps.
  if (scope === "SELECTED") {
    return "FAST";
  }

  // Optional explicit override for debugging / admin override.
  if (engineHint === "FAST" || engineHint === "BULK_OPS") {
    // For non-SELECTED scopes, allow the hint directly.
    return engineHint;
  }

  const estimated = await estimateExportRecordCount({
    prisma,
    shopId,
    scope,
    selectedProductIds,
    planHash,
  });

  if ((scope === "ALL" || scope === "FILTERED") && estimated >= BULK_OPS_THRESHOLD) {
    return "BULK_OPS";
  }

  return "FAST";
}

/* ========================================================================== *
 * Resolvers
 * ========================================================================== */

async function exportJobsResolver(
  _parent: unknown,
  args: ExportJobsArgs,
  ctx: GraphQLContext,
) {
  const { shopId, prisma } = ctx;

  if (!shopId) {
    throw new Error("Shop context is required");
  }

  const { first, after, filter } = args;

  if (first <= 0) {
    throw new Error("first must be > 0");
  }
  if (first > 100) {
    throw new Error("first must be <= 100");
  }

  const whereClauses: any[] = [
    {
      shopId,
    },
  ];

  if (filter?.status) {
    whereClauses.push({ status: gqlStatusToPrisma(filter.status) });
  }

  if (filter?.format) {
    whereClauses.push({ format: gqlFormatToPrisma(filter.format) });
  }

  if (filter?.query && filter.query.trim().length > 0) {
    const query = filter.query.trim();
    const maybeId = BigIntSafe(query);

    const orConditions: any[] = [
      {
        name: {
          contains: query,
          mode: "insensitive" as const,
        },
      },
    ];

    if (maybeId !== null) {
      orConditions.push({ id: maybeId });
    }

    whereClauses.push({
      OR: orConditions,
    });
  }

  let cursorCondition: any = {};
  if (after) {
    const { createdAt, id } = decodeCursor(after);

    cursorCondition = {
      OR: [
        {
          createdAt: {
            lt: createdAt,
          },
        },
        {
          createdAt,
          id: {
            lt: id,
          },
        },
      ],
    };
  }

  const where: any = {
    AND: [...whereClauses, cursorCondition],
  };

  const take = first + 1;

  const jobs = await prisma.exportJob.findMany({
    where,
    orderBy: [
      { createdAt: "desc" },
      { id: "desc" },
    ],
    take,
  });

  const hasNextPage = jobs.length > first;
  const nodes = hasNextPage ? jobs.slice(0, first) : jobs;

  const edges = nodes.map((job) => {
    const node = mapExportJobToGqlDto(job);
    return {
      cursor: encodeCursor(job),
      node,
    };
  });

  const startCursor = edges.length > 0 ? edges[0].cursor : null;
  const endCursor =
    edges.length > 0 ? edges[edges.length - 1].cursor : null;

  return {
    edges,
    pageInfo: {
      hasNextPage,
      hasPreviousPage: !!after,
      startCursor,
      endCursor,
    },
  };
}

async function exportJobResolver(
  _parent: unknown,
  args: ExportJobArgs,
  ctx: GraphQLContext,
) {
  const { shopId, prisma } = ctx;

  if (!shopId) {
    throw new Error("Shop context is required");
  }

  const jobId = parseBigIntId(args.id);

  const job = await prisma.exportJob.findFirst({
    where: {
      id: jobId,
      shopId,
    },
  });

  if (!job) {
    return null;
  }

  return mapExportJobToGqlDto(job);
}

async function startExportJobResolver(
  _parent: unknown,
  args: StartExportJobArgs,
  ctx: GraphQLContext,
) {
  const { shopId, prisma } = ctx;

  if (!shopId) {
    throw new Error("Shop context is required");
  }

  const {
    name,
    format,
    scope,
    fieldKeys,
    planHash,
    filterJson,
    selectedProductIds,
    engineHint,
  } = args.input;

  if (!name || name.trim().length === 0) {
    throw new Error("Export name is required");
  }

  if (!Array.isArray(fieldKeys) || fieldKeys.length === 0) {
    throw new Error("At least one fieldKey must be provided");
  }

  if (scope === "SELECTED") {
    if (!selectedProductIds || selectedProductIds.length === 0) {
      throw new Error(
        "selectedProductIds are required when scope is SELECTED",
      );
    }

    if (selectedProductIds.length > 5_000) {
      throw new Error(
        "Too many selected products for SELECTED scope; please reduce selection or use FILTERED / ALL exports.",
      );
    }
  }

  if (scope === "FILTERED") {
    if (!planHash && !filterJson) {
      throw new Error(
        "FILTERED scope requires planHash or filterJson to be provided.",
      );
    }
  }

  const prismaScope = gqlScopeToPrisma(scope);
  const prismaFormat = gqlFormatToPrisma(format);

  const engine = await chooseExportEngine({
    prisma,
    shopId,
    scope: prismaScope,
    selectedProductIds: selectedProductIds ?? null,
    planHash: planHash ?? null,
    engineHint: engineHint ?? null,
  });

  // Create job + fields in a single transaction.
  const job = await prisma.$transaction(async (tx) => {
    const createdJob = await tx.exportJob.create({
      data: {
        shopId,
        name: name.trim(),
        status: "PENDING",
        format: prismaFormat,
        scope: prismaScope,
        recordCount: 0,
        fileSizeBytes: null,
        storageKey: null,
        planHash: planHash ?? null,
        filterJson: (filterJson ?? null) as any,
        selectedProductIds: selectedProductIds
          ? ((selectedProductIds as unknown) as any)
          : null,
        engine,
      },
    });

    // Keep field creation in the same transaction.
    await tx.exportJobField.createMany({
      data: fieldKeys.map((fieldKey, index) => ({
        exportJobId: createdJob.id,
        fieldKey,
        order: index,
      })),
    });

    return createdJob;
  });

  if (engine === "FAST") {
    const payload: ExportJobPayload = {
      shopId,
      exportJobId: job.id.toString(),
    };

    await exportQueue.add("export-job", payload, {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1_000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    });
  } else {
    const payload: BulkExportJobPayload = {
      shopId,
      exportJobId: job.id.toString(),
    };

    await exportBulkOpsQueue.add("export-job", payload, {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2_000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    });
  }

  return {
    job: mapExportJobToGqlDto(job),
  };
}

async function retryExportJobResolver(
  _parent: unknown,
  args: RetryExportJobArgs,
  ctx: GraphQLContext,
) {
  const { shopId, prisma } = ctx;

  if (!shopId) {
    throw new Error("Shop context is required");
  }

  const jobId = parseBigIntId(args.id);

  const existing = await prisma.exportJob.findFirst({
    where: {
      id: jobId,
      shopId,
    },
  });

  if (!existing) {
    throw new Error("Export job not found");
  }

  if (existing.status !== "FAILED") {
    throw new Error("Only FAILED export jobs can be retried");
  }

  // For older jobs that might not have engine set, recompute it.
  const engine: EngineKind =
    (existing.engine as EngineKind | null) ??
    (await chooseExportEngine({
      prisma,
      shopId,
      scope: existing.scope as PrismaExportScope,
      selectedProductIds: (existing.selectedProductIds as any) ?? null,
      planHash: existing.planHash ?? null,
      engineHint: null,
    }));

  const updated = await prisma.exportJob.update({
    where: { id: jobId },
    data: {
      status: "PENDING",
      recordCount: 0,
      fileSizeBytes: null,
      errorMessage: null,
      completedAt: null,
      storageKey: null,
      engine,
    },
  });

  if (engine === "BULK_OPS") {
    const payload: BulkExportJobPayload = {
      shopId,
      exportJobId: updated.id.toString(),
    };

    await exportBulkOpsQueue.add("export-job", payload, {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2_000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    });
  } else {
    const payload: ExportJobPayload = {
      shopId,
      exportJobId: updated.id.toString(),
    };

    await exportQueue.add("export-job", payload, {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1_000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    });
  }

  return {
    job: mapExportJobToGqlDto(updated),
  };
}

/* ========================================================================== *
 * Export resolver map
 * ========================================================================== */

export const exportResolvers = {
  Query: {
    exportJobs: exportJobsResolver,
    exportJob: exportJobResolver,
  },
  Mutation: {
    startExportJob: startExportJobResolver,
    retryExportJob: retryExportJobResolver,
  },
};
