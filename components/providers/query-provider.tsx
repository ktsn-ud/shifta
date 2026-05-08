"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { getBrowserQueryClient } from "@/lib/query/query-client";

type QueryProviderProps = {
  children: ReactNode;
};

export function QueryProvider({ children }: QueryProviderProps) {
  return (
    <QueryClientProvider client={getBrowserQueryClient()}>
      {children}
    </QueryClientProvider>
  );
}
