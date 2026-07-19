"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * TanStack Query for the client surfaces that need live data — the rep verify
 * queue, and the live counts to come (§2.1). One client per browser session,
 * created lazily so it is stable across re-renders but never shared between
 * requests on the server.
 *
 * Defaults tuned for a realtime-fed cache: we do not poll (Realtime pushes the
 * invalidation), and a short staleTime means a refetch-on-reconnect actually
 * refetches rather than serving a cache that drifted while the socket was down.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            refetchOnWindowFocus: true,
            retry: 1,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
