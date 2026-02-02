// FILE: web/graphql/filtering/buildSnapshotFullTextQuery.ts

import { Prisma } from "@prisma/client";
import type {
  SnapshotPlanResult,
  FullTextFilterSpec,
} from "./planSnapshotProductWhere";

/**
 * Row shape returned from raw snapshotProducts query.
 * Adjust fields if your SnapshotProduct schema differs.
 */
export interface SnapshotProductRow {
  id: string;
  shopId: string;
  productId: string;
  snapshotRunId: string;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  searchEngineVisibility: string | null;
}

/**
 * Build a parameterized SQL query for SnapshotProduct that:
 *
 * - Filters by shopId + snapshotRunId (multi-tenant + run-scoped)
 * - Applies any scalar snapshot filters (EQ / IS_SET / IS_NOT_SET)
 * - Applies full-text filters via tsvector @@ to_tsquery(config, query)
 * - Uses id-based cursor pagination (forward-only)
 *
 * Uses Prisma.Sql to safely parameterize all user-controlled values.
 */
export function buildSnapshotFullTextQuery(args: {
  shopId: string;
  snapshotRunId: string;
  plan: SnapshotPlanResult;
  limit: number;
  cursorId?: string | null;
}): Prisma.Sql {
  const { shopId, snapshotRunId, plan, limit, cursorId } = args;
  const { snapshotWhere, fullTextFilters } = plan;

  const whereClauses: Prisma.Sql[] = [];

  // Multi-tenant + run-scoped
  whereClauses.push(Prisma.sql`"shopId" = ${shopId}`);
  whereClauses.push(Prisma.sql`"snapshotRunId" = ${snapshotRunId}`);

  // Cursor-based pagination: id > cursorId (ascending order)
  if (cursorId) {
    whereClauses.push(Prisma.sql`"id" > ${cursorId}`);
  }

  // Scalar snapshot filters (non-full-text), converted to SQL
  if (snapshotWhere) {
    const scalarConditions = snapshotWhereToSql(snapshotWhere);
    whereClauses.push(...scalarConditions);
  }

  // Full-text filters
  for (const spec of fullTextFilters) {
    const ftSql = fullTextFilterToSql(spec);
    if (ftSql) {
      whereClauses.push(ftSql);
    }
  }

  const whereSql =
    whereClauses.length > 0
      ? Prisma.sql`WHERE ${Prisma.join(whereClauses, Prisma.sql` AND `)}`
      : Prisma.sql``;

  // Simple, stable ordering + limit
  // - ASC on id so that cursorId <-> id > cursorId works
  const limitSql = Prisma.sql`LIMIT ${limit}`;

  const sql = Prisma.sql`
    SELECT
      "id",
      "shopId",
      "productId",
      "snapshotRunId",
      "description",
      "seoTitle",
      "seoDescription",
      "searchEngineVisibility"
    FROM "SnapshotProduct"
    ${whereSql}
    ORDER BY "id" ASC
    ${limitSql}
  `;

  return sql;
}

// -----------------------------------------------------------------------------
// Internal helpers
// -----------------------------------------------------------------------------

/**
 * Convert snapshotWhere (simple AND tree) into an array of Prisma.Sql conditions.
 *
 * We only support the shapes we know planSnapshotProductWhere emits for now:
 * - { AND: [ { field: { equals: value } }, { field: { not: null } }, ... ] }
 */
function snapshotWhereToSql(
  where: Prisma.SnapshotProductWhereInput,
): Prisma.Sql[] {
  const clauses: Prisma.Sql[] = [];

  if (where.AND && Array.isArray(where.AND)) {
    for (const sub of where.AND) {
      if (!sub) continue;
      clauses.push(...snapshotWhereToSql(sub));
    }
    return clauses;
  }

  for (const [field, cond] of Object.entries(where)) {
    if (field === "AND" || field === "OR" || field === "NOT") continue;
    if (!cond) continue;

    // cond is something like { equals: value } or { not: null }
    const c = cond as any;

    // equals: value
    if (Object.prototype.hasOwnProperty.call(c, "equals")) {
      const value = c.equals;
      clauses.push(
        Prisma.sql`${Prisma.sql([`"${field}"`])} = ${value}`,
      );
      continue;
    }

    // equals: null
    if (Object.prototype.hasOwnProperty.call(c, "equals") && c.equals === null) {
      clauses.push(Prisma.sql`${Prisma.sql([`"${field}"`])} IS NULL`);
      continue;
    }

    // not: null  (IS NOT NULL)
    if (
      Object.prototype.hasOwnProperty.call(c, "not") &&
      c.not === null
    ) {
      clauses.push(Prisma.sql`${Prisma.sql([`"${field}"`])} IS NOT NULL`);
      continue;
    }

    // Fallback: log unsupported condition
    console.warn(
      `[buildSnapshotFullTextQuery] Unsupported scalar where condition for field '${field}':`,
      cond,
    );
  }

  return clauses;
}

/**
 * Convert a full-text filter spec into a Prisma.Sql condition:
 *
 *  vectorField @@ to_tsquery(config::regconfig, query)
 *
 * If negated, wraps with NOT(...).
 */
function fullTextFilterToSql(
  spec: FullTextFilterSpec,
): Prisma.Sql | null {
  const { fullText, query, negated } = spec;

  if (!fullText || fullText.plane !== "SNAPSHOT") return null;

  const vectorField = fullText.vectorField;
  const config = fullText.config ?? "english";

  const vectorIdent = Prisma.sql([`"${vectorField}"`]);

  const tsExpr = Prisma.sql`${vectorIdent} @@ to_tsquery(${config}::regconfig, ${query})`;

  if (negated) {
    return Prisma.sql`NOT (${tsExpr})`;
  }

  return tsExpr;
}
