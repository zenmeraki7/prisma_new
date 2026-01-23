// web/graphql/resolvers/index.ts
import type { GraphQLFieldResolver } from "graphql";
import type { GraphqlContext } from "../context.js";

type Resolver = GraphQLFieldResolver<unknown, GraphqlContext>;

const health: Resolver = () => {
  return "ok";
};

export const resolvers = {
  Query: {
    health,
  },
};
