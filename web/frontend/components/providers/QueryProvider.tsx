// web/frontend/components/QueryProvider.tsx

import React from "react";
import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";

// Create once, outside component
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

type Props = {
  children: React.ReactNode;
};

export function QueryProvider({ children }: Props) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}