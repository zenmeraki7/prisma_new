// FILE: web/graphql/resolvers/index.js
//
// Merge all resolver maps and export for use with Apollo Server / GraphQL Yoga.
// Extend this file as more resolver modules are added.

import GraphQLJSON from "graphql-type-json";
import { Kind } from "graphql"; // for safe parseLiteral
import { productFilterResolvers } from "./productFilter.resolvers.js";

/**
 * Custom scalar resolvers.
 *
 * NOTE:
 * - JSON: passthrough via graphql-type-json
 * - DateTime: ISO-8601 strings <-> JS Date
 */
const scalarResolvers = {
  JSON: GraphQLJSON,

  DateTime: {
    // Outbound: DB/JS value -> GraphQL response
    serialize: (value) => {
      if (value instanceof Date) {
        return value.toISOString();
      }
      // Accept ISO string or numeric timestamp; fallback to String
      const date =
        typeof value === "string" || typeof value === "number"
          ? new Date(value)
          : null;

      if (date && !Number.isNaN(date.getTime())) {
        return date.toISOString();
      }

      // Last resort: avoid throwing at serialize boundary
      return String(value);
    },

    // Inbound: variables -> JS value
    parseValue: (value) => {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        throw new TypeError(`Invalid DateTime value: ${value}`);
      }
      return date;
    },

    // Inbound: literals in query -> JS value
    parseLiteral: (ast) => {
      if (ast.kind !== Kind.STRING) {
        throw new TypeError(`DateTime literal must be a string, got: ${ast.kind}`);
      }
      const date = new Date(ast.value);
      if (Number.isNaN(date.getTime())) {
        throw new TypeError(`Invalid DateTime literal: ${ast.value}`);
      }
      return date;
    },
  },
};

/**
 * Root resolver map.
 *
 * Shape must match:
 *   - Query type from schema
 *   - Named object types (ProductRow, VariantRow, etc.)
 *   - Custom scalars (JSON, DateTime)
 */
export const resolvers = {
  // Scalars
  ...scalarResolvers,

  // Query root
  Query: {
    ...productFilterResolvers.Query,
    // other Query resolvers go here
  },

  // Object type resolvers
  ProductRow: productFilterResolvers.ProductRow,
  VariantRow: productFilterResolvers.VariantRow,
  // other type resolvers go here
};