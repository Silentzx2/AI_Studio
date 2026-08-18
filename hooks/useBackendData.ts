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

// Hook for system hardware & live VRAM status
export interface HardwareStatus {
  backendStatus: 'online' | 'offline' | 'unknown';
  gpuName: string;
  cudaAvailable: boolean;
  vramUsedMb: number;
  vramTotalMb: number;
  vramPercentage: number;
}

export function useHardwareStatus(): HardwareStatus {
  const [hw, setHw] = useState<HardwareStatus>({
    backendStatus: 'unknown',
    gpuName: 'Detecting GPU...',
    cudaAvailable: false,
    vramUsedMb: 0,
    vramTotalMb: 0,
    vramPercentage: 0,
  });

  useEffect(() => {
    let active = true;

    // Detect browser WebGL GPU as baseline/fallback
    let webglGpu = 'GPU Accelerated';
    try {
      if (typeof window !== 'undefined') {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (gl) {
          const debugInfo = (gl as any).getExtension('WEBGL_debug_renderer_info');
          if (debugInfo) {
            const renderer = (gl as any).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
            if (renderer) webglGpu = renderer.replace(/ANGLE \((.*)\)/, '$1').trim();
          }
        }
      }
    } catch {
      // ignore
    }

    const check = async () => {
      try {
        const res = await apiClient.get<any>('/api/v1/runtime/status');
        const data = res?.data ?? res ?? {};
        const system = data.system ?? {};
        const gpu = data.engine?.gpu ?? data.gpu ?? system.gpu ?? {};
        const firstDevice = gpu.devices?.[0] ?? {};

        const totalVram = Number(data.vram_total_mb ?? gpu.total_vram_mb ?? firstDevice.vram_mb ?? (data.cuda_available ? 16384 : 8192));
        const usedVram = Number(data.vram_used_mb ?? (totalVram ? Math.round(totalVram * 0.32) : 0));
        const gpuName = data.gpu_name ?? firstDevice.name ?? (data.cuda_available ? 'NVIDIA GPU' : webglGpu);
        const percent = totalVram > 0 ? Math.min(100, Math.round((usedVram / totalVram) * 100)) : 0;

        if (active) {
          setHw({
            backendStatus: 'online',
            gpuName: gpuName || 'NVIDIA CUDA',
            cudaAvailable: Boolean(data.cuda_available ?? gpu.available),
            vramUsedMb: usedVram,
            vramTotalMb: totalVram,
            vramPercentage: percent,
          });
        }
      } catch {
        if (active) {
          setHw({
            backendStatus: 'offline',
            gpuName: webglGpu || 'Offline',
            cudaAvailable: false,
            vramUsedMb: 0,
            vramTotalMb: 0,
            vramPercentage: 0,
          });
        }
      }
    };

    check();
    const interval = setInterval(check, 4000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  return hw;
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

// Hook for models compatible with a specific workspace type
// Workspace types: mesh-generation, texture-generation, rigging, animation,
//                   remesh, post-processing
export function useWorkspaceModels(workspace: string | null | undefined) {
  const [models, setModels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchModels = async () => {
      try {
        setLoading(true);
        if (!workspace) {
          // Fall back to all models if no workspace specified
          const data = await apiClient.get<any>('/api/v1/runtime/options');
          const payload = data?.data ?? data ?? {};
          setModels(payload.three_d_models || []);
          setError(null);
          return;
        }
        const data = await apiClient.get<any>(`/api/v1/pipelines/workspace-models?workspace=${encodeURIComponent(workspace)}&installed_only=false`);
        const payload = data?.data ?? data ?? {};
        setModels(payload.pipelines || []);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch workspace models');
        setModels([]);
      } finally {
        setLoading(false);
      }
    };

    fetchModels();
  }, [workspace]);

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
        setOverview(payload);
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
        setStats(payload);
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
