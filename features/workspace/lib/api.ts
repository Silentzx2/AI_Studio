import type { SystemStats } from '@/features/workspace/types';
import { getApiClient as baseApiClient } from '@/services/apiClient';
import { dedupedGet } from '@/lib/requestDedup';

export interface HistoryItem {
  prompt?: [number, string, Record<string, unknown>, Record<string, unknown>, string[]];
  outputs?: Record<string, Record<string, unknown>>;
  status?: { status_str?: string; completed?: boolean; messages?: unknown[] };
}

const API_BASE = '/api/v1';

export interface BackendSystemStats {
  status: 'online' | 'offline' | 'connecting' | 'error';
  host: string;
  gpu: string;
  vramUsedGb: number | null;
  vramTotalGb: number | null;
  ramUsedGb: number | null;
  ramTotalGb: number | null;
  torchVramUsedGb: number | null;
  torchVramTotalGb: number | null;
  gpuType: string | null;
  gpuIndex: number | null;
  pythonVersion: string | null;
  torchVersion: string | null;
  apiVersion: string | null;
  queueRunning: number;
  queuePending: number;
  activePromptId: string | null;
  activeNode: string | null;
  lastPingMs: number;
}

class ApiClient {
  private listeners: Map<string, Set<(data: unknown) => void>>;
  private _host: string;

  constructor() {
    this.listeners = new Map();
    this._host = API_BASE;
  }

  private emit(event: string, data: unknown) {
    this.listeners.get(event)?.forEach(cb => {
      try { cb(data); } catch { /* ignore listener errors */ }
    });
  }

  public getBaseUrl(): string { return this._host; }

  public on(event: string, callback: (data: unknown) => void) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(callback);
    return () => this.off(event, callback);
  }

  public off(event: string, callback: (data: unknown) => void) {
    this.listeners.get(event)?.delete(callback);
  }

  async getSystemStats(): Promise<BackendSystemStats> {
    const start = performance.now();
    try {
      const [sysRes, gpuRes, runtimeRes] = await Promise.allSettled([
        dedupedGet<Record<string, unknown>>('/api/v1/system/info'),
        dedupedGet<Record<string, unknown>>('/api/v1/system/gpu'),
        dedupedGet<Record<string, unknown>>('/api/v1/system/scheduler-status'),
      ]);

      const latency = Math.round(performance.now() - start);
      const isAnyOk = sysRes.status === 'fulfilled' || gpuRes.status === 'fulfilled' || runtimeRes.status === 'fulfilled';

      if (!isAnyOk) {
        return {
          status: 'offline',
          host: API_BASE,
          gpu: 'Unavailable',
          vramUsedGb: null, vramTotalGb: null,
          ramUsedGb: null, ramTotalGb: null,
          torchVramUsedGb: null, torchVramTotalGb: null,
          gpuType: null, gpuIndex: null,
          pythonVersion: null, torchVersion: null,
          apiVersion: null,
          queueRunning: 0, queuePending: 0,
          activePromptId: null, activeNode: null,
          lastPingMs: latency,
        };
      }

      const rawGpu = gpuRes.status === 'fulfilled' ? gpuRes.value : {};
      const rawSys = sysRes.status === 'fulfilled' ? sysRes.value : {};
      const rawRt = runtimeRes.status === 'fulfilled' ? runtimeRes.value : {};

      const gpuData = (rawGpu.data ?? rawGpu) as Record<string, any>;
      const sysData = (rawSys.data ?? rawSys) as Record<string, any>;
      const rtData = (rawRt.data ?? rawRt) as Record<string, any>;

      // Extract GPU details
      const gpusList = Array.isArray(gpuData.gpus) ? gpuData.gpus : (Array.isArray(sysData.gpu?.gpus) ? sysData.gpu.gpus : []);
      const primaryGpu = gpusList[0] || gpuData.gpu || {};
      const gpuName = primaryGpu.name || gpuData.name || sysData.gpu?.name || 'NVIDIA GPU';

      // VRAM in MB or bytes
      let vramTotalMb = primaryGpu.total_memory_mb ?? primaryGpu.vram_mb ?? gpuData.vram_total_mb ?? rtData.vram_total_mb;
      let vramFreeMb = primaryGpu.free_memory_mb ?? primaryGpu.free_vram_mb ?? gpuData.vram_free_mb;
      let vramUsedMb = primaryGpu.used_memory_mb ?? (vramTotalMb && vramFreeMb != null ? Math.max(0, vramTotalMb - vramFreeMb) : gpuData.vram_used_mb ?? rtData.vram_used_mb);

      // System Memory
      const sysMem = sysData.memory || sysData.system_resources?.memory || {};
      const ramTotalMb = sysMem.total_mb ?? (sysMem.total ? sysMem.total / (1024 * 1024) : undefined);
      const ramUsedMb = sysMem.used_mb ?? (sysMem.used ? sysMem.used / (1024 * 1024) : undefined);

      const vramUsedGb = vramUsedMb != null ? Number((vramUsedMb / 1024).toFixed(2)) : (primaryGpu.vram_used_gb ?? null);
      const vramTotalGb = vramTotalMb != null ? Number((vramTotalMb / 1024).toFixed(2)) : (primaryGpu.vram_total_gb ?? null);
      const ramUsedGb = ramUsedMb != null ? Number((ramUsedMb / 1024).toFixed(2)) : null;
      const ramTotalGb = ramTotalMb != null ? Number((ramTotalMb / 1024).toFixed(2)) : null;

      const pythonVer = sysData.basic_info?.python_version || sysData.python_version || sysData.environment?.python_version || null;
      const torchVer = gpuData.cuda?.torch_version || sysData.environment?.torch_version || gpuData.torch_version || null;
      const apiVer = sysData.service?.api_version || sysData.service?.version || 'v1';

      return {
        status: 'online',
        host: API_BASE,
        gpu: gpuName,
        vramUsedGb,
        vramTotalGb,
        ramUsedGb,
        ramTotalGb,
        torchVramUsedGb: null,
        torchVramTotalGb: null,
        gpuType: primaryGpu.type || gpuData.type || 'CUDA',
        gpuIndex: primaryGpu.index ?? 0,
        pythonVersion: typeof pythonVer === 'string' ? pythonVer.split(' ')[0] : null,
        torchVersion: typeof torchVer === 'string' ? torchVer : null,
        apiVersion: apiVer,
        queueRunning: Number(rtData.queue_running ?? rtData.active_jobs ?? 0),
        queuePending: Number(rtData.queue_pending ?? rtData.pending_jobs ?? 0),
        activePromptId: null,
        activeNode: null,
        lastPingMs: latency,
      };
    } catch {
      return {
        status: 'offline',
        host: API_BASE,
        gpu: 'Unavailable',
        vramUsedGb: null, vramTotalGb: null,
        ramUsedGb: null, ramTotalGb: null,
        torchVramUsedGb: null, torchVramTotalGb: null,
        gpuType: null, gpuIndex: null,
        pythonVersion: null, torchVersion: null,
        apiVersion: null,
        queueRunning: 0, queuePending: 0,
        activePromptId: null, activeNode: null,
        lastPingMs: 0,
      };
    }
  }

  async getQueue(): Promise<{ running: unknown[]; pending: unknown[] }> {
    try {
      const res = await fetch(`${API_BASE}/jobs?status=queued&limit=50`, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) return { running: [], pending: [] };
      const payload = await res.json();
      const data = (payload?.data ?? payload) as { jobs?: unknown[] };
      return { running: data.jobs ?? [], pending: [] };
    } catch {
      return { running: [], pending: [] };
    }
  }

  async getHistory(maxItems = 20): Promise<Record<string, HistoryItem>> {
    try {
      const res = await fetch(`${API_BASE}/generation/history?limit=${maxItems}`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return {};
      const payload = await res.json();
      const data = (payload?.data ?? payload) as { jobs?: Array<Record<string, unknown>> };
      const result: Record<string, HistoryItem> = {};
      (data.jobs ?? []).forEach((j, i) => {
        const jobId = (j.id ?? j.job_id ?? `job-${i}`) as string;
        result[jobId] = {
          prompt: [0, (j.prompt ?? '') as string, {}, {}, []] as unknown as HistoryItem['prompt'],
          outputs: {
            ...((j.result_urls ?? j.result ?? {}) as Record<string, unknown>),
            glb: j.model_url || (j.result as any)?.model_url,
            model_url: j.model_url || (j.result as any)?.model_url,
            thumbnail: j.thumbnail_url || (j.result as any)?.thumbnail_url,
            thumbnail_url: j.thumbnail_url || (j.result as any)?.thumbnail_url,
            polygon_count: j.polygon_count ?? (j.result as any)?.polygon_count,
            vertex_count: j.vertex_count ?? (j.result as any)?.vertex_count,
            dimensions: j.dimensions ?? (j.result as any)?.dimensions,
            bounding_box: j.bounding_box ?? (j.result as any)?.bounding_box,
            object_count: j.object_count ?? (j.result as any)?.object_count,
            component_count: j.component_count ?? (j.result as any)?.component_count,
            material_count: j.material_count ?? (j.result as any)?.material_count,
            topology: j.topology ?? (j.result as any)?.topology,
            mesh_details: j.mesh_details ?? (j.result as any)?.mesh_details,
            postprocess_status: j.postprocess_status ?? (j.result as any)?.postprocess_status,
          },
          status: { status_str: (j.status ?? 'unknown') as string, completed: j.status === 'completed' || j.status === 'succeeded' || j.status === 'completed_degraded' },
        };
      });
      return result;
    } catch {
      return {};
    }
  }

  async deleteHistory(promptId: string): Promise<void> {
    try {
      await fetch(`${API_BASE}/jobs/${promptId}`, { method: 'DELETE', signal: AbortSignal.timeout(5000) });
    } catch { /* ignore */ }
  }

  connectWebSocket() { /* SSE handled by individual components */ }
  disconnectWebSocket() {}

  emitProgress(progress: number, node?: string) {
    this.emit('progress', { value: progress, max: 100, node });
  }

  emitExecuting(node?: string) {
    this.emit('executing', { node });
  }

  emitExecuted() {
    this.emit('executed', {});
    this.emit('connected', { status: 'online' });
  }

  emitError(message: string) {
    this.emit('execution_error', { exception_message: message });
  }

  cancelExecution() {
    this.emit('execution_error', { exception_message: 'Execution cancelled by user' });
  }
}

// Workspace-specific apiClient: wraps services/apiClient via prototype
// inheritance. ApiClient extends the shared client class at runtime, so
// workspace helpers (on/off, getSystemStats, …) are available here while
// the shared singleton remains untouched.
const wsApiClient = new ApiClient();

export interface WorkspaceApiClient {
  on(event: string, cb: (...args: unknown[]) => void): () => void;
  off(event: string, cb: (...args: unknown[]) => void): void;
  getSystemStats(): Promise<Record<string, unknown>>;
  getQueue(): Promise<{ running: unknown[]; pending: unknown[] }>;
  getHistory(maxItems?: number): Promise<Record<string, HistoryItem>>;
  deleteHistory(jobId: string): Promise<void>;
  cancelExecution(): void;
  emitProgress(progress: unknown): void;
  executing(node: string | null): void;
  executed(node: string, data: unknown): void;
  executionError(error: unknown): void;
  connectWebSocket(): void;
  disconnectWebSocket(): void;
  getBaseUrl(): string;
  setBaseUrl(url: string): void;
}

export const apiClient = Object.create(baseApiClient, {
  on: { value: wsApiClient.on.bind(wsApiClient) },
  off: { value: wsApiClient.off.bind(wsApiClient) },
  getSystemStats: { value: wsApiClient.getSystemStats.bind(wsApiClient) },
  getQueue: { value: wsApiClient.getQueue.bind(wsApiClient) },
  getHistory: { value: wsApiClient.getHistory.bind(wsApiClient) },
  deleteHistory: { value: wsApiClient.deleteHistory.bind(wsApiClient) },
  cancelExecution: { value: wsApiClient.cancelExecution.bind(wsApiClient) },
  emitProgress: { value: wsApiClient.emitProgress.bind(wsApiClient) },
  emitExecuting: { value: wsApiClient.emitExecuting.bind(wsApiClient) },
  emitExecuted: { value: wsApiClient.emitExecuted.bind(wsApiClient) },
  emitError: { value: wsApiClient.emitError.bind(wsApiClient) },
  connectWebSocket: { value: wsApiClient.connectWebSocket.bind(wsApiClient) },
  disconnectWebSocket: { value: wsApiClient.disconnectWebSocket.bind(wsApiClient) },
  getBaseUrl: { value: wsApiClient.getBaseUrl.bind(wsApiClient) },
  setBaseUrl: { value: (baseApiClient as any).setBaseUrl },
}) as unknown as WorkspaceApiClient;

export async function fetchSystemStats(): Promise<SystemStats> {
  const stats = await apiClient.getSystemStats();
  return { ...stats, apiVersion: null } as SystemStats;
}
