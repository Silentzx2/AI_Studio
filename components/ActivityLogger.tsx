'use client';

/**
 * ActivityLogger — project-wide activity logger.
 *
 * Mounted once in app/layout.tsx. Captures two things on the client:
 *   1. Every API call made through window.fetch (method, path, status, duration)
 *   2. Every user click on a button / link / [role="button"]
 *
 * Each event is written to the browser console AND fire-and-forget POSTed to
 * POST /api/v1/system/log so it lands in the same logs/api.log as the backend
 * request logs — one unified log for the whole project.
 *
 * The log POST itself is excluded to avoid an infinite loop.
 */
import { useEffect } from 'react';

import { API_URL } from '@/services/apiClient';

const LOG_ENDPOINT = '/api/v1/system/log';

interface ActivityEntry {
  ts: string;
  type: 'api' | 'click' | 'error';
  detail: string;
}

function now(): string {
  return new Date().toISOString();
}

function postLog(entry: ActivityEntry): void {
  try {
    fetch(`${API_URL}${LOG_ENDPOINT}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
      keepalive: true,
    }).catch(() => {
      // Logging must never break the app — swallow failures silently.
    });
  } catch {
    // ignore
  }
}

export function ActivityLogger() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // ── 1. API call logging (wrapped fetch) ────────────────────────────────
    let originalFetch: typeof window.fetch;
    let fetchIntercepted = false;

    try {
      originalFetch = window.fetch.bind(window);
      const wrappedFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const method = (init?.method ?? 'GET').toUpperCase();
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        const start = performance.now();
        try {
          const res = await originalFetch(input, init);
          if (!url.includes(LOG_ENDPOINT)) {
            const durationMs = Math.round(performance.now() - start);
            const entry: ActivityEntry = {
              ts: now(),
              type: 'api',
              detail: `${method} ${url} → ${res.status} (${durationMs}ms)`,
            };
            console.info(`[activity] ${entry.detail}`);
            postLog(entry);
          }
          return res;
        } catch (err) {
          const durationMs = Math.round(performance.now() - start);
          const detail = `${method} ${url} FAILED (${durationMs}ms)`;
          console.error(`[activity] ${detail}`, err);
          postLog({ ts: now(), type: 'error', detail });
          throw err;
        }
      };

      // Attempt to override window.fetch
      Object.defineProperty(window, 'fetch', {
        value: wrappedFetch,
        configurable: true,
        writable: true,
      });
      fetchIntercepted = true;
    } catch (e) {
      console.warn('[ActivityLogger] Could not intercept window.fetch:', e);
    }

    // ── 2. Button/link click logging (delegated listener) ───────────────────
    const onClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement | null)?.closest?.(
        'button, a, [role="button"], [role="menuitem"], [onclick]',
      ) as HTMLElement | null;
      if (!target) return;
      const label =
        target.getAttribute('aria-label') ||
        target.textContent?.trim().slice(0, 80) ||
        target.tagName.toLowerCase();
      const entry: ActivityEntry = { ts: now(), type: 'click', detail: label };
      console.info(`[activity] click: ${label}`);
      postLog(entry);
    };
    document.addEventListener('click', onClick, { capture: true });

    return () => {
      if (fetchIntercepted && originalFetch) {
        try {
          Object.defineProperty(window, 'fetch', {
            value: originalFetch,
            configurable: true,
            writable: true,
          });
        } catch {
          // Fallback if defineProperty fails
          (window as any).fetch = originalFetch;
        }
      }
      document.removeEventListener('click', onClick, { capture: true });
    };
  }, []);

  return null;
}
