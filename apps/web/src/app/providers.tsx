"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "framer-motion";
import { ThemeProvider } from "next-themes";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: true,
          },
        },
      }),
  );
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      {/* reducedMotion="user" disables transform/layout animation for users
          with prefers-reduced-motion while keeping opacity fades. */}
      <MotionConfig reducedMotion="user">
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </MotionConfig>
    </ThemeProvider>
  );
}
