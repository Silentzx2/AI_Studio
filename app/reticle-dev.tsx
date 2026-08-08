'use client';

/**
 * ReticleDev — dev-only observability SDK mount for Next.js (App Router).
 *
 * Auto-mounted in app/layout.tsx in development mode only.
 * Tree-shaken out of production builds — zero runtime cost.
 *
 * Installs React fiber instrumentation, connects to the Reticle bridge daemon
 * (localhost:4400), and registers capabilities for agent debugging.
 */
import { useEffect } from 'react';

export function ReticleDev() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    void import('@reticlehq/react').then(
      ({ reticle, install }) => {
        install();
        const token = process.env.NEXT_PUBLIC_RETICLE_TOKEN;
        reticle.connect({ ...(token ? { token } : {}), session: 'ai3d-studio' });
      },
    );
  }, []);
  return null;
}
