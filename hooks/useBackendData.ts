/**
 * Standalone backend data hooks.
 *
 * NOTE: These make their own API calls and are intended for use OUTSIDE of
 * WorkspaceContext. WorkspaceContext already polls system stats, history, and
 * runtime options — using these hooks inside a WorkspaceContext subtree will
 * duplicate polling. Prefer reading from the WorkspaceContext when available.
 *
 * @WARNING Using this hook inside WorkspaceContext subtree duplicates polling.
 */
import { useEffect, useState, useRef } from 'react';
import { apiClient } from '@/services/apiClient';
import { useRealtime } from '@/hooks/useRealtime';
import { dedupedGet, TTL } from '@/lib/requestDedup';

export type BackendStatus = 'unknown' | 'online' | 'offline';

export function useBackendStatus(): BackendStatus {
  const realtime = useRealtime();
  const [polledStatus, setPolledStatus] = useState<BackendStatus>('unknown');

  // When WebSocket is connected, derive status from it directly
  useEffect(() => {
    if (realtime.connected) {
      setPolledStatus('online');
    }
  }, [realtime.connected]);

  // Fallback polling only when WebSocket is disconnected
  useEffect(() => {
    if (realtime.connected) return; // WebSocket handles status

    let active = true;
    const check = async () => {
      try {
        await apiClient.get('/api/v1/runtime/health', false, false);
        if (active) setPolledStatus('online');
      } catch {
        if (active) setPolledStatus('offline');
      }
    };
    check();
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      check();
    }, 60000);
    return () => { active = false; clearInterval(interval); };
  }, [realtime.connected]);

  return realtime.connected ? 'online' : polledStatus;
}

export function useRuntimeOptions() {
  const [options, setOptions] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let active = true;

    // Try SSE first for real-time system stats
    const es = new EventSource('/api/v1/system/stream');
    esRef.current = es;
    es.onmessage = (e) => {
      if (!active) return;
      try {
        const data = JSON.parse(e.data);
        // Merge SSE data into options when we have it
        setOptions((prev: any) => prev ? { ...prev, ...data } : data);
      } catch { /* ignore parse errors */ }
    };
    es.onerror = () => {
      es.close();
      esRef.current = null;
    };

    // Fetch full options data (deduped — 60s TTL)
    const fetchOptions = async () => {
      try {
        const data = await dedupedGet<any>('/api/v1/runtime/options', TTL.OPTIONS);
        if (active) {
          // Fresh data MUST win over prev: spreading prev last would let the
          // stale model list (pre-install) override the just-updated options,
          // so a newly installed provider never appears in the selector.
          setOptions((prev: any) => ({ ...prev, ...(data?.data ?? data ?? {}) }));
          setError(null);
          setLoading(false);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to fetch options');
          setLoading(false);
        }
      }
    };

    fetchOptions();
    return () => {
      active = false;
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, []);

  return { options, loading, error };
}

export function useSystemSettings() {
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setLoading(true);
        const data = await apiClient.get<any>('/api/v1/admin/settings');
        const payload = data?.data ?? data ?? {};
        setSettings({
          ...payload,
          default_provider: payload.default_provider ?? payload.ai_provider ?? payload.aiProvider,
        });
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch settings');
        setSettings(null);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  return { settings, loading, error };
}
