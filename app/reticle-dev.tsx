'use client';

/**
 * ReticleDev — dev-only observability SDK mount for Next.js (App Router).
 *
 * Auto-mounted in app/layout.tsx in development mode only.
 * Tree-shaken out of production builds — zero runtime cost.
 *
 * Installs React fiber instrumentation, connects to the Reticle bridge daemon
 * (localhost:4400), and enables presenter mode (HUD: glow border, animated
 * cursor, narration line per action).
 */
import { useEffect } from 'react';

export function ReticleDev() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    void import('@reticlehq/react').then(
      ({ reticle, install }) => {
        install();
        reticle.connect({
          session: 'ai3d-studio',
          present: true, // enable HUD: glow border + narration
        });
      },
    );
  }, []);
  return null;
}
