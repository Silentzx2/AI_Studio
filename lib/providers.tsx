"use client";


import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { useState, useEffect } from 'react';
import { useThemeStore } from '@/stores/useThemeStore';
import { getCacheService } from '@/services/cacheService';

// Reticle dev-only observability SDK — tree-shaken out of production builds.
// install() walks the React fiber tree so Reticle can map DOM elements back to
// component stacks + source file. Must run before reticle.connect().
const RETICLE_ENABLED = process.env.NODE_ENV === 'development';

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

  useEffect(() => {
    if (RETICLE_ENABLED) {
      import('@reticlehq/react').then(({ install, reticle }) => {
        install();
        reticle.connect({ session: 'ai3d-studio' });
      });
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ThemeAwareToaster />
    </QueryClientProvider>
  );
}
