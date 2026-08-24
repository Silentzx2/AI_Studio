import { useEffect, useState } from 'react';
import { apiClient } from '@/services/apiClient';

export type BackendStatus = 'unknown' | 'online' | 'offline';

export function useBackendStatus(): BackendStatus {
  const [status, setStatus] = useState<BackendStatus>('unknown');

  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        await apiClient.get('/api/v1/runtime/health', false, false);
        if (active) setStatus('online');
      } catch {
        if (active) setStatus('offline');
      }
    };
    check();
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      check();
    }, 30000);
    return () => { active = false; clearInterval(interval); };
  }, []);

  return status;
}

export function useRuntimeOptions() {
  const [options, setOptions] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOptions = async () => {
      try {
        setLoading(true);
        const data = await apiClient.get<any>('/api/v1/runtime/options');
        setOptions(data?.data ?? data ?? {});
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch options');
        setOptions(null);
      } finally {
        setLoading(false);
      }
    };
    fetchOptions();
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
