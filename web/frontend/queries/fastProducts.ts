import { useQuery } from "@tanstack/react-query";
import { graphqlRequest } from "../../utils/graphqlClient";

export interface ApiFilterPayload {
  key: string;
  operator: string;
  value: any;
}

interface UseFastProductsArgs {
  filter: {
    predicates: ApiFilterPayload[];
  };
}

export function useFastProducts(args: UseFastProductsArgs) {
  return useQuery({
    queryKey: ["fastProducts", args],
    queryFn: async () => {
      return graphqlRequest<any>(
        `
        query FastProducts($filter: FastProductFilterInput) {
          fastProducts(filter: $filter) {
            id
            title
          }
        }
        `,
        { filter: args.filter }
      );
    },
  });
}
