"use client";

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { useState } from 'react';
import { useThemeStore } from '@/stores/useThemeStore';

/**
 * Toaster that follows the Appearance theme setting (dark / light / system).
 * The AppearanceProvider owns the <html> theme class; we only mirror it here
 * so sonner toasts match. Replaces the previous next-themes coupling.
 */
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
        defaultOptions: { queries: { staleTime: 60 * 1000, retry: 1 } },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ThemeAwareToaster />
    </QueryClientProvider>
  );
}
