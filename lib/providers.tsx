"use client";


import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { useState } from 'react';
import { useThemeStore } from '@/stores/useThemeStore';
import { getCacheService } from '@/services/cacheService';

function ThemeAwareToaster() {
  const theme = useThemeStore((s) => s.theme);
  return (
    <Toaster
      position="bottom-right"
      theme={theme}
      richColors
      closeButton
      toastOptions={{
        style: {
          background: 'hsl(var(--popover))',
          border: '1px solid hsl(var(--border))',
          color: 'hsl(var(--popover-foreground))',
          backdropFilter: 'blur(20px)',
        },
      }}
    />
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  getCacheService();

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ThemeAwareToaster />
    </QueryClientProvider>
  );
}
