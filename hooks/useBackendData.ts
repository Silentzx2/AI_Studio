import { useEffect, useState, useCallback } from 'react';
import { apiClient } from '@/services/apiClient';

export type BackendStatus = 'unknown' | 'online' | 'offline';

// Hook for backend connection status (health check polling)
// Returns tri-state: 'unknown' while first check is in-flight,
// then 'online' or 'offline' once the first check resolves.
export function useBackendStatus(): BackendStatus {
  const [status, setStatus] = useState<BackendStatus>('unknown');

  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        await apiClient.get('/api/v1/runtime/health');
        if (active) setStatus('online');
      } catch {
        if (active) setStatus('offline');
      }
    };
    check();
    const interval = setInterval(check, 5000);
    return () => { active = false; clearInterval(interval); };
  }, []);

  return status;
}

// Hook for generation history
export function useGenerationHistory(limit: number = 20) {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        setLoading(true);
        const data = await apiClient.get<any>(
          `/api/v1/generation/history?limit=${limit}&offset=0`
        );
        const payload = data?.data ?? data ?? {};
        setHistory(payload.jobs || payload.history || []);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch history');
        setHistory([]);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [limit]);

  return { history, loading, error };
}

// Hook for available 3D generation models
// Fetches from /api/v1/runtime/options which returns pipeline-aware three_d_models
export function useAvailableModels() {
  const [models, setModels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchModels = async () => {
      try {
        setLoading(true);
        const data = await apiClient.get<any>('/api/v1/runtime/options');
        const payload = data?.data ?? data ?? {};
        // Extract three_d_models from runtime options
        setModels(payload.three_d_models || []);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch models');
        setModels([]);
      } finally {
        setLoading(false);
      }
    };

    fetchModels();
  }, []);

  return { models, loading, error };
}

// Hook for system overview
export function useSystemOverview() {
  const [overview, setOverview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOverview = async () => {
      try {
        setLoading(true);
        const data = await apiClient.get<any>('/api/v1/admin/overview');
        const payload = data?.data ?? data ?? {};
        setOverview({ ...payload, overview: payload });
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch overview');
        setOverview(null);
      } finally {
        setLoading(false);
      }
    };

    fetchOverview();
  }, []);

  return { overview, loading, error };
}

// Hook for system statistics
export function useSystemStatistics() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const data = await apiClient.get<any>('/api/v1/system/statistics');
        const payload = data?.data ?? data ?? {};
        setStats({ ...payload, stats: payload });
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch statistics');
        setStats(null);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  return { stats, loading, error };
}

// Hook for generation job status (Real-time via SSE)
export function useGenerationStatus(jobId: string | null) {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(!!jobId);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;

    const unsubscribe = apiClient.streamEvents(
      `/api/v1/generation/${jobId}/status`,
      (event) => {
        setStatus(event);
        setError(null);
      },
      () => {
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [jobId]);

  return { status, loading, error };
}

// Hook for runtime options (available providers, modes)
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

// Hook for system settings
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
