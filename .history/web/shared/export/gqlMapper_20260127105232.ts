// web/shared/export/gqlMapper.ts
//
// Single source of truth for mapping Prisma ExportJob -> GraphQL ExportJob DTO.
//
// Prisma model (simplified):
//   model ExportJob {
//     id            BigInt   @id @default(autoincrement())
//     shopId        Int
//     name          String
//     status        ExportStatus
//     format        ExportFormat
//     scope         ExportScope
//     recordCount   Int       @default(0)
//     fileSizeBytes BigInt?   // nullable until file is written
//     storageKey    String?   // "<shopId>/<jobId>.<ext>", relative to EXPORTS_DIR
//     errorMessage  String?
//     createdAt     DateTime  @default(now())
//     completedAt   DateTime?
//     // ... other internal fields (engine, planHash, etc.)
//   }
//
// GraphQL SDL:
//
//   type ExportJob {
//     id: ID!
//     name: String!
//     format: ExportFormat!
//     scope: ExportScope!
//     status: ExportStatus!
//     recordCount: Int!
//     fileSizeBytes: BigInt
//     createdAt: DateTime!
//     completedAt: DateTime
//     downloadUrl: String
//     errorMessage: String
//   }
//
// Frontend fragment:
//
//   fragment ExportJobFields on ExportJob {
//     id
//     name
//     format
//     scope
//     status
//     recordCount
//     fileSizeBytes
//     createdAt
//     completedAt
//     downloadUrl
//     errorMessage
//   }
//
// This file keeps the field-by-field mapping in ONE place.
//

import type { ExportJob as ExportJobModel } from "@prisma/client";
import type {
  ExportStatusGql,
  ExportFormatGql,
  ExportScopeGql,
} from "./types";
import {
  prismaStatusToGql,
  prismaFormatToGql,
  prismaScopeToGql,
} from "./prismaMapping";

/* ========================================================================== *
 * GraphQL-facing DTO
 * ========================================================================== */

export interface ExportJobGqlDto {
  id: string;
  name: string;
  status: ExportStatusGql;
  format: ExportFormatGql;
  scope: ExportScopeGql;
  recordCount: number;
  fileSizeBytes: number | null;
  createdAt: Date;
  completedAt: Date | null;
  downloadUrl: string | null;
  errorMessage: string | null;
}

/* ========================================================================== *
 * Internal helpers
 * ========================================================================== */

/**
 * Convert a BigInt (or nullish) into a JS number for GraphQL.
 * If the value is larger than Number.MAX_SAFE_INTEGER, we clamp to null
 * rather than return an unsafe number.
 */
function bigIntToSafeNumber(value: bigint | null | undefined): number | null {
  if (value == null) return null;
  const asNumber = Number(value);
  if (!Number.isFinite(asNumber)) return null;
  if (asNumber > Number.MAX_SAFE_INTEGER) {
    // Extremely unlikely for file sizes, but we fail safe.
    return null;
  }
  return asNumber;
}

/**
 * Build a public-facing download URL from the job's storageKey.
 *
 * Must match the Express route:
 *   GET /api/exports/:storageKey(*)
 *
 * Where storageKey is exactly the relative path written by the workers, e.g.:
 *   "123/456.csv"
 *
 * Multi-tenant safety is enforced server-side by the route checking
 * that storageKey starts with `${shopId}/`.
 *
 * If EXPORTS_PUBLIC_BASE_URL is set, we use that as an absolute base,
 * otherwise we return a relative URL suitable for embedded apps.
 */
function buildExportDownloadUrl(job: ExportJobModel): string | null {
  // Only completed jobs should expose a download URL.
  if (!job.storageKey || job.status !== "COMPLETED") {
    return null;
  }

  const base =
    process.env.EXPORTS_PUBLIC_BASE_URL || "/api/exports";

  // storageKey already contains "<shopId>/<jobId>.<ext>"
  const encodedKey = encodeURIComponent(job.storageKey);

  // If base is relative (e.g. "/api/exports"), this yields a relative URL.
  // If base is absolute (e.g. "https://app.example.com/api/exports"),
  // this yields an absolute URL.
  return `${base}/${encodedKey}`;
}

/* ========================================================================== *
 * Public mapper
 * ========================================================================== */

/**
 * Map a Prisma ExportJob model instance into the GraphQL ExportJob DTO.
 *
 * This is the ONLY place you should be doing field-level mapping for
 * ExportJob in your GraphQL layer.
 */
export function mapExportJobToGqlDto(
  job: ExportJobModel,
): ExportJobGqlDto {
  return {
    id: job.id.toString(),
    name: job.name,

    status: prismaStatusToGql(job.status),
    format: prismaFormatToGql(job.format),
    scope: prismaScopeToGql(job.scope),

    recordCount: job.recordCount,
    fileSizeBytes: bigIntToSafeNumber(job.fileSizeBytes ?? null),

    createdAt: job.createdAt,
    completedAt: job.completedAt ?? null,

    downloadUrl: buildExportDownloadUrl(job),
    errorMessage: job.errorMessage ?? null,
  };
}
