// web/graphql/resolvers/export/startExportJob.ts
//
// GraphQL resolver for startExportJob(input: StartExportJobInput!).
// - Decides between FAST vs BULK_OPS engines.
// - Persists a single ExportJob row (Prisma).
// - Enqueues the correct worker queue.
// - Returns a GraphQL ExportJob using mapExportJobToGqlDto so
//   the shape is identical no matter which engine is used.

import type { ExportScope as PrismaExportScope } from "@prisma/client";

import { prisma } from "../../../db/prisma";
import {
  gqlFormatToPrisma,
  gqlScopeToPrisma,
} from "../../../shared/export/prismaMapping";
import { mapExportJobToGqlDto } from "../../../shared/export/gqlMapper";

import {
  exportQueue,
  type ExportJobPayload,
} from "../../../lib/jobs/queues/exportQueue";

import {
  exportBulkOpsQueue,
  type BulkExportJobPayload,
} from "../../../lib/jobs/queues/exportBulkOpsQueue";

type StartExportJobInput = {
  name: string;
  format: "CSV" | "XLSX" | "JSON" | "XML";
  scope: "ALL" | "FILTERED" | "SELECTED";
  fieldKeys: string[];
  selectedProductIds?: string[] | null;
  planHash?: string | null;
  filterJson?: unknown | null;
  // Optional hint – you can drop this if you don't want callers to override.
  engineHint?: "FAST" | "BULK_OPS" | null;
};

type StartExportJobArgs = {
  input: StartExportJobInput;
};

type GraphqlContext = {
  shopId: number;
};

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
  shopId: number;
  scope: PrismaExportScope;
  selectedProductIds?: string[] | null;
  planHash?: string | null;
}): Promise<number> {
  const { shopId, scope, selectedProductIds, planHash } = args;

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

const BULK_OPS_THRESHOLD = 5_000; // tune as needed

type EngineKind = "FAST" | "BULK_OPS";

/**
 * Decide which engine to use for this export.
 * - "FAST": uses product_lite + variant_rollup + streaming writer.
 * - "BULK_OPS": uses Shopify Bulk Operation JSONL → transform.
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
  shopId: number;
  scope: PrismaExportScope;
  selectedProductIds?: string[] | null;
  planHash?: string | null;
  engineHint?: EngineKind | null;
}): Promise<EngineKind> {
  const { shopId, scope, selectedProductIds, planHash, engineHint } = args;

  // Hard rule: SELECTED can never use BulkOps.
  if (scope === "SELECTED") {
    return "FAST";
  }

  // Optional override for debugging / forcing engines.
  if (engineHint === "FAST" || engineHint === "BULK_OPS") {
    return engineHint;
  }

  const estimated = await estimateExportRecordCount({
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
 * Resolver
 * ========================================================================== */

export const startExportJobResolver = async (
  _parent: unknown,
  { input }: StartExportJobArgs,
  ctx: GraphqlContext,
) => {
  const { shopId } = ctx;

  if (!shopId) {
    throw new Error("Shop context is required");
  }

  const {
    name,
    format,
    scope,
    fieldKeys,
    selectedProductIds,
    planHash,
    filterJson,
    engineHint,
  } = input;

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
    shopId,
    scope: prismaScope,
    selectedProductIds: selectedProductIds ?? null,
    planHash: planHash ?? null,
    engineHint: engineHint ?? null,
  });

  // Persist a single canonical ExportJob row (plus fields) in a transaction.
  const job = await prisma.$transaction(async (tx) => {
    const createdJob = await tx.exportJob.create({
      data: {
        shopId,
        name: name.trim(),
        status: "PENDING",
        format: prismaFormat,
        scope: prismaScope,
        engine, // Prisma enum ExportEngine if you defined one
        recordCount: 0,
        fileSizeBytes: null,
        storageKey: null,
        errorMessage: null,
        selectedProductIds:
          prismaScope === "SELECTED"
            ? ((selectedProductIds ?? []) as any)
            : null,
        planHash:
          prismaScope === "FILTERED" ? planHash ?? null : null,
        filterJson:
          prismaScope === "FILTERED" ? ((filterJson ?? null) as any) : null,
      },
    });

    await tx.exportJobField.createMany({
      data: fieldKeys.map((fieldKey, index) => ({
        exportJobId: createdJob.id,
        fieldKey,
        order: index,
      })),
    });

    return createdJob;
  });

  // Enqueue the job on the correct queue.
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
      // removeOnComplete/removeOnFail can be configured as defaultJobOptions
      // on the queue itself; leave them to the queue config.
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
    });
  }

  // ✅ Map Prisma -> GraphQL once, identical shape for FAST & BulkOps.
  return {
    job: mapExportJobToGqlDto(job),
  };
};
