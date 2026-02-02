// FILE: web/graphql/resolvers/runSnapshot.ts

import type { PrismaClient } from "@prisma/client";
import {
  FilterPlanner,
  type UserFilter,
} from "../../lib/filters/planner";
import {
  FILTER_REGISTRY,
  type FilterKey,
  type FilterOperator,
} from "../../lib/filters/registry";
import { snapshotQueue, enqueueSnapshotInitiateJob } from "../../../web/jobs/Producers/snapshotQueue";

interface GraphQLContext {
  prisma: PrismaClient;
  shopId: string;
  shopDomain: string;   // needed for Shopify client
  accessToken: string;  // shop access token
}

interface RunSnapshotArgs {
  input: {
    filter: {
      predicates: {
        key: string;
        operator: string;
        value: any;
      }[];
    };
  };
}

// --- Helper: reuse FastProductFilter parsing ---

function buildUserFiltersFromFastInput(
  filterInput: RunSnapshotArgs["input"]["filter"],
): UserFilter[] {
  const predicates = filterInput?.predicates ?? [];
  const userFilters: UserFilter[] = [];

  for (const p of predicates) {
    const key = p.key as FilterKey;
    const operator = p.operator as FilterOperator;

    if (!FILTER_REGISTRY[key]) {
      console.warn(`[runSnapshot] Unknown filter key from client: ${p.key}`);
      continue;
    }

    userFilters.push({
      key,
      operator,
      value: p.value,
    });
  }

  return userFilters;
}

export const runSnapshotResolvers = {
  Mutation: {
    runSnapshot: async (
      _parent: unknown,
      args: RunSnapshotArgs,
      ctx: GraphQLContext,
    ) => {
      const { prisma, shopId, shopDomain, accessToken } = ctx;
      const { filter } = args.input;

      // 1. Turn GraphQL filter input → UserFilter[]
      const userFilters = buildUserFiltersFromFastInput(filter);

      // 2. Planner splits FAST vs SNAPSHOT filters
      const planResult = FilterPlanner.plan(userFilters);
      const fastWhere = planResult.fastQuery;
      const snapshotFilters = planResult.snapshotTasks; // SNAPSHOT-plane only

      const snapshotFilterKeys: FilterKey[] = snapshotFilters.map((f) => f.key);

      if (snapshotFilterKeys.length === 0) {
        // No snapshot-plane filters. You can choose to:
        // - still allow a snapshot (maybe "all products"), or
        // - reject as invalid.
        console.warn("[runSnapshot] No snapshot-plane filters; proceeding anyway.");
      }

      // 3. Candidate set: FAST plane products for this shop
      const productRows = await prisma.productLite.findMany({
        where: {
          shopId,
          ...fastWhere,
        },
        select: {
          productId: true, // Shopify product ID
        },
      });

      const candidateIds = productRows.map((r) => r.productId);

      // 4. Create SnapshotRun row
      const snapshotRun = await prisma.snapshotRun.create({
        data: {
          shopId,
          status: "QUEUED",
          candidateCount: candidateIds.length,
          filterJson: filter, // store the raw GraphQL filter input
        },
      });

      // 5. Enqueue INITIATE job for snapshotWorker
      await enqueueSnapshotInitiateJob({
        action: "INITIATE",
        shopId,
        accessToken,
        candidateIds,
        filterKeys: snapshotFilterKeys,
        // bulkOperationId/url will be set later on PROCESS_RESULT via webhook
      });

      // 6. Return SnapshotRun to the client
      return {
        id: snapshotRun.id,
        shopId: snapshotRun.shopId,
        status: snapshotRun.status,
        createdAt: snapshotRun.createdAt.toISOString(),
        updatedAt: snapshotRun.updatedAt.toISOString(),
        bulkOperationId: snapshotRun.bulkOperationId,
        bulkOperationStatus: snapshotRun.bulkOperationStatus,
        bulkOperationUrl: snapshotRun.bulkOperationUrl,
        errorMessage: snapshotRun.errorMessage,
        candidateCount: snapshotRun.candidateCount,
        filterJson: snapshotRun.filterJson,
      };
    },
  },
};
