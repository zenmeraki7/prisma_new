// web/graphql/export/resolvers.ts
//
// GraphQL resolvers for Export jobs (FAST + BulkOps).
//
// Matches SDL:
//
//   enum ExportEngine { FAST BULK_OPS }
//   enum ExportStatus { PENDING RUNNING COMPLETED FAILED }
//   enum ExportFormat { CSV XLSX JSON XML }
//   enum ExportScope { ALL FILTERED SELECTED }
//
//   type ExportJob { ... }
//   input StartExportJobInput { ... }
//   input ExportJobsFilterInput { ... }
//
// And integrates with:
//
//   - FAST worker: web/workers/export.fast.worker.ts (exportQueue)
//   - BulkOps worker: web/workers/export.bulkOps.worker.ts (exportBulkOpsQueue)
//   - Prisma models: ExportJob, ExportJobField
//

import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import {
  exportQueue,
  type ExportJobPayload,
} from "../../lib/jobs/queues/exportQueue";
import {
  exportBulkOpsQueue,
  type BulkExportJobPayload,
} from "../../lib/jobs/queues/exportBulkOpsQueue";

// Adjust this import to your actual GraphQL context type.
type GraphQLContext = {
  shopId: number;
};

// ---------------------------------------------------------------------------
// Cursor helpers (id-based keyset pagination)
// ---------------------------------------------------------------------------

function encodeCursor(id: bigint): string {
  const raw = id.toString();
  return Buffer.from(raw, "utf8").toString("base64");
}

function decodeCursor(cursor: string): bigint {
  const raw = Buffer.from(cursor, "base64").toString("utf8");
  return BigInt(raw);
}

// ---------------------------------------------------------------------------
// Download URL helper
// ---------------------------------------------------------------------------

/**
 * Build a download URL for an export job based on its storageKey.
 *
 * Both FAST + BulkOps workers write files under:
 *   baseDir = EXPORTS_DIR or <project>/exports
 *   storageKey = relative path from baseDir (e.g. "123/456.csv")
 *
 * This helper assumes you have some HTTP endpoint that can serve those
 * storageKeys, e.g.:
 *   GET /api/exports/:shopId/:fileName
 *
 * For flexibility, we use an env-based base URL.
 */
function buildExportDownloadUrl(
  job: { shopId: number; storageKey: string | null; status: string },
): string | null {
  if (!job.storageKey) return null;
  if (job.status !== "COMPLETED") return null;

  const base =
    process.env.EXPORTS_PUBLIC_BASE_URL ||
    "/api/exports"; // adjust to your actual route

  // storageKey already includes the shop subdir (e.g. "123/456.csv")
  // So we just append it as-is.
  return `${base}/${encodeURIComponent(job.storageKey)}`;
}

// ---------------------------------------------------------------------------
// DTO mapper: Prisma ExportJob -> GraphQL ExportJob
// ---------------------------------------------------------------------------

/**
 * Map Prisma ExportJob -> GraphQL ExportJob DTO.
 *
 * SDL fragment:
 *
 * fragment ExportJobFields on ExportJob {
 *   id
 *   name
 *   format
 *   scope
 *   status
 *   recordCount
 *   fileSizeBytes
 *   createdAt
 *   completedAt
 *   downloadUrl
 *   errorMessage
 * }
 */
function mapExportJobToGqlDto(job: any) {
  return {
    id: job.id.toString(),
    name: job.name,
    status: job.status,
    format: job.format,
    scope: job.scope,
    engine: job.engine,
    recordCount: job.recordCount ?? 0,
    fileSizeBytes: job.fileSizeBytes ?? null,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
    downloadUrl: buildExportDownloadUrl(job),
    errorMessage: job.errorMessage ?? null,
  };
}

// ---------------------------------------------------------------------------
// Engine decision logic
// ---------------------------------------------------------------------------

type ExportScope = "ALL" | "FILTERED" | "SELECTED";
type ExportEngine = "FAST" | "BULK_OPS";

interface EngineDecisionInput {
  scope: ExportScope;
  engineHint?: ExportEngine | null;
  selectedProductIdsLength: number;
}

/**
 * Decide which engine to use for a new export job.
 *
 * Rules:
 *  - SELECTED scope => always FAST (BulkOps can't handle arbitrary id lists).
 *  - If engineHint is provided:
 *      - Respect it, but clamp SELECTED+BulkOps to FAST.
 *  - ALL / FILTERED:
 *      - Default to BULK_OPS, since that's safer for large exports.
 *
 * You can later enhance this by estimating size based on product counts or
 * snapshot cardinality.
 */
function decideExportEngine(
  input: EngineDecisionInput,
): ExportEngine {
  const { scope, engineHint, selectedProductIdsLength } = input;

  if (scope === "SELECTED") {
    // Even if caller hints BULK_OPS, SELECTED cannot be handled by BulkOps.
    return "FAST";
  }

  if (engineHint) {
    if (scope === "SELECTED" && engineHint === "BULK_OPS") {
      return "FAST";
    }
    return engineHint;
  }

  // Default: ALL / FILTERED => BulkOps (safer for large result sets).
  return "BULK_OPS";
}

// ---------------------------------------------------------------------------
// Resolvers
// ---------------------------------------------------------------------------

export const exportResolvers = {
  Query: {
    /**
     * Paginated list of export jobs for the current shop.
     */
    async exportJobs(
      _: unknown,
      args: {
        first: number;
        after?: string | null;
        filter?: {
          status?: string | null;
          format?: string | null;
          query?: string | null;
        } | null;
      },
      ctx: GraphQLContext,
    ) {
      const { shopId } = ctx;
      const first = Math.min(Math.max(args.first, 1), 50); // clamp 1..50

      const where: Prisma.ExportJobWhereInput = {
        shopId,
      };

      if (args.filter?.status) {
        where.status = args.filter.status as any;
      }
      if (args.filter?.format) {
        where.format = args.filter.format as any;
      }

      if (args.filter?.query) {
        const q = args.filter.query.trim();
        if (q) {
          const maybeId = BigIntSafe(q);
          if (maybeId !== null) {
            // Numeric query: treat as id search.
            where.id = maybeId;
          } else {
            // Non-numeric: free-text search over name.
            // NOTE: This is ILIKE '%q%' via Prisma `contains`. For very large
            // tables you may want a trigram index or more sophisticated search.
            where.name = {
              contains: q,
              mode: "insensitive",
            };
          }
        }
      }

      let cursorId: bigint | null = null;
      if (args.after) {
        cursorId = decodeCursor(args.after);
        // For descending id order, we want strictly smaller ids after the cursor.
        where.id = {
          ...(typeof where.id === "bigint" ? { equals: where.id } : {}),
          lt: cursorId,
        } as any;
      }

      // Fetch one extra to compute hasNextPage.
      const take = first + 1;

      const jobs = await prisma.exportJob.findMany({
        where,
        orderBy: {
          id: "desc", // id is autoincrement BigInt; correlates with createdAt
        },
        take,
      });

      const hasNextPage = jobs.length > first;
      const slice = hasNextPage ? jobs.slice(0, first) : jobs;

      const edges = slice.map((job) => ({
        cursor: encodeCursor(job.id),
        node: mapExportJobToGqlDto(job),
      }));

      const startCursor = edges.length > 0 ? edges[0].cursor : null;
      const endCursor =
        edges.length > 0 ? edges[edges.length - 1].cursor : null;

      return {
        edges,
        pageInfo: {
          hasNextPage,
          hasPreviousPage: !!args.after,
          startCursor,
          endCursor,
        },
      };
    },

    /**
     * Fetch a single export job by ID for the current shop.
     */
    async exportJob(
      _: unknown,
      args: { id: string },
      ctx: GraphQLContext,
    ) {
      const { shopId } = ctx;
      const id = BigInt(args.id);

      const job = await prisma.exportJob.findFirst({
        where: { id, shopId },
      });

      if (!job) return null;

      return mapExportJobToGqlDto(job);
    },
  },

  Mutation: {
    /**
     * Start a new export job for the current shop.
     */
    async startExportJob(
      _: unknown,
      args: {
        input: {
          name: string;
          format: "CSV" | "XLSX" | "JSON" | "XML";
          scope: "ALL" | "FILTERED" | "SELECTED";
          fieldKeys: string[];
          planHash?: string | null;
          filterJson?: any;
          selectedProductIds?: string[] | null;
          engineHint?: ExportEngine | null;
        };
      },
      ctx: GraphQLContext,
    ) {
      const { shopId } = ctx;
      const {
        name,
        format,
        scope,
        fieldKeys,
        planHash,
        filterJson,
        selectedProductIds = [],
        engineHint,
      } = args.input;

      if (!fieldKeys || fieldKeys.length === 0) {
        throw new Error("fieldKeys must contain at least one field.");
      }

      if (scope === "FILTERED" && !planHash && !filterJson) {
        // Depending on your semantics, you might require planHash, filterJson, or both.
        throw new Error(
          "FILTERED scope requires planHash or filterJson to be provided.",
        );
      }

      if (scope === "SELECTED" && selectedProductIds.length === 0) {
        throw new Error(
          "SELECTED scope requires selectedProductIds to be non-empty.",
        );
      }

      const engine = decideExportEngine({
        scope,
        engineHint: engineHint ?? null,
        selectedProductIdsLength: selectedProductIds.length,
      });

      // Create ExportJob row.
      const job = await prisma.exportJob.create({
        data: {
          shopId,
          name,
          status: "PENDING",
          format,
          scope,
          engine,
          recordCount: 0,
          fileSizeBytes: null,
          storageKey: null,
          errorMessage: null,
          planHash: planHash ?? null,
          filterJson: filterJson as Prisma.JsonValue | undefined,
          selectedProductIds:
            scope === "SELECTED" ? (selectedProductIds as any) : null,
        },
      });

      // Persist field selection in order.
      await prisma.exportJobField.createMany({
        data: fieldKeys.map((fieldKey, index) => ({
          exportJobId: job.id,
          fieldKey,
          order: index,
        })),
      });

      // Enqueue job into the appropriate engine queue.
      const payload: ExportJobPayload & BulkExportJobPayload = {
        shopId,
        exportJobId: job.id.toString(),
      };

      if (engine === "FAST") {
        await exportQueue.add("export-fast", payload, {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 1_000,
          },
        });
      } else {
        await exportBulkOpsQueue.add("export-bulk-ops", payload, {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 2_000,
          },
        });
      }

      return {
        job: mapExportJobToGqlDto(job),
      };
    },

    /**
     * Retry a previously FAILED export job.
     */
    async retryExportJob(
      _: unknown,
      args: { id: string },
      ctx: GraphQLContext,
    ) {
      const { shopId } = ctx;
      const id = BigInt(args.id);

      const existing = await prisma.exportJob.findFirst({
        where: {
          id,
          shopId,
        },
      });

      if (!existing) {
        throw new Error("Export job not found for current shop.");
      }

      if (existing.status !== "FAILED") {
        throw new Error(
          `Only FAILED export jobs can be retried (current status=${existing.status}).`,
        );
      }

      const engine: ExportEngine =
        existing.engine ??
        decideExportEngine({
          scope: existing.scope as ExportScope,
          engineHint: null,
          selectedProductIdsLength:
            Array.isArray(existing.selectedProductIds)
              ? existing.selectedProductIds.length
              : 0,
        });

      const reset = await prisma.exportJob.update({
        where: { id: existing.id },
        data: {
          status: "PENDING",
          errorMessage: null,
          recordCount: 0,
          fileSizeBytes: null,
          storageKey: null,
          completedAt: null,
          engine,
        },
      });

      const payload: ExportJobPayload & BulkExportJobPayload = {
        shopId,
        exportJobId: reset.id.toString(),
      };

      if (engine === "FAST") {
        await exportQueue.add("export-fast-retry", payload, {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 1_000,
          },
        });
      } else {
        await exportBulkOpsQueue.add("export-bulk-ops-retry", payload, {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 2_000,
          },
        });
      }

      return {
        job: mapExportJobToGqlDto(reset),
      };
    },
  },
};

// ---------------------------------------------------------------------------
// Small helper: safe BigInt parse for query search
// ---------------------------------------------------------------------------

function BigIntSafe(raw: string): bigint | null {
  if (!/^[0-9]+$/.test(raw)) return null;
  try {
    return BigInt(raw);
  } catch {
    return null;
  }
}
