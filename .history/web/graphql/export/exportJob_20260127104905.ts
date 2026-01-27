// web/graphql/resolvers/export/exportJob.ts
//
// Single ExportJob lookup for a detail view.
// Multi-tenant: strictly scoped by ctx.shopId.
//

import { prisma } from "../../../db/prisma";
import { mapExportJobToGqlDto } from "../../../shared/export/gqlMapper";

type ExportJobArgs = {
  id: string;
};

type GraphqlContext = {
  shopId: number;
};

/**
 * Safely parse a string into BigInt, with a clear error on invalid input.
 */
function parseBigIntId(id: string): bigint {
  try {
    return BigInt(id);
  } catch {
    throw new Error("Invalid export job ID");
  }
}

export const exportJobResolver = async (
  _parent: unknown,
  args: ExportJobArgs,
  ctx: GraphqlContext,
) => {
  const { shopId } = ctx;

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
};
