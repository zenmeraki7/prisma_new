// FILE: web/graphql/resolvers/index.ts
import { fastProductsResolvers } from "./fastProducts";
import { runSnapshotResolvers } from "./runSnapshot";
import { snapshotRunsResolvers } from "./snapshotRuns";
import { snapshotProductsResolvers } from "./snapshotProducts";

export const resolvers = {
  Query: {
    ...fastProductsResolvers.Query,
    ...snapshotRunsResolvers.Query,
    ...snapshotProductsResolvers.Query,
  },
  Mutation: {
    ...runSnapshotResolvers.Mutation,
  },
};
