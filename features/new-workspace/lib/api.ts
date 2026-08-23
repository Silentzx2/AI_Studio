import type { SystemStats } from '@/features/new-workspace/types';

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
        fetch(`${API_BASE}/system/info`, { signal: AbortSignal.timeout(4000) }),
        fetch(`${API_BASE}/system/gpu`, { signal: AbortSignal.timeout(4000) }),
        fetch(`${API_BASE}/runtime/status`, { signal: AbortSignal.timeout(4000) }),
      ]);

      const latency = Math.round(performance.now() - start);
      const gpu = gpuRes.status === 'fulfilled' && gpuRes.value.ok ? await gpuRes.value.json() as Record<string, unknown> : {};
      const sys = sysRes.status === 'fulfilled' && sysRes.value.ok ? await sysRes.value.json() as Record<string, unknown> : {};
      const runtime = runtimeRes.status === 'fulfilled' && runtimeRes.value.ok ? await runtimeRes.value.json() as Record<string, unknown> : {};

      const gpuMem = (gpu.gpu_memory ?? gpu.memory ?? {}) as Record<string, number>;
      const sysMem = (sys.memory ?? {}) as Record<string, number>;

      return {
        status: 'online',
        host: API_BASE,
        gpu: (gpu.name ?? gpu.model ?? 'Unknown GPU') as string,
        vramUsedGb: typeof gpuMem.used === 'number' ? Number((gpuMem.used / (1024 ** 3)).toFixed(2)) : null,
        vramTotalGb: typeof gpuMem.total === 'number' ? Number((gpuMem.total / (1024 ** 3)).toFixed(2)) : null,
        ramUsedGb: typeof sysMem.used === 'number' ? Number((sysMem.used / (1024 ** 3)).toFixed(2)) : null,
        ramTotalGb: typeof sysMem.total === 'number' ? Number((sysMem.total / (1024 ** 3)).toFixed(2)) : null,
        torchVramUsedGb: null,
        torchVramTotalGb: null,
        gpuType: (gpu.type ?? gpu.backend ?? null) as string | null,
        gpuIndex: (gpu.index ?? gpu.gpu_index ?? null) as number | null,
        pythonVersion: (sys.python_version ?? null) as string | null,
        torchVersion: (gpu.torch_version ?? gpu.pytorch ?? null) as string | null,
        apiVersion: null,
        queueRunning: (runtime.queue_running ?? runtime.active_jobs ?? 0) as number,
        queuePending: (runtime.queue_pending ?? runtime.pending_jobs ?? 0) as number,
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
      const res = await fetch(`${API_BASE}/generation/history?limit=5`, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) return { running: [], pending: [] };
      const data = await res.json() as { jobs?: unknown[] };
      return { running: data.jobs ?? [], pending: [] };
    } catch {
      return { running: [], pending: [] };
    }
  }

  async getHistory(maxItems = 20): Promise<Record<string, HistoryItem>> {
    try {
      const res = await fetch(`${API_BASE}/generation/history?limit=${maxItems}`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return {};
      const data = await res.json() as { jobs?: Array<Record<string, unknown>> };
      const result: Record<string, HistoryItem> = {};
      (data.jobs ?? []).forEach((j, i) => {
        const jobId = (j.id ?? j.job_id ?? `job-${i}`) as string;
        result[jobId] = {
          prompt: [0, (j.prompt ?? '') as string, {}, {}, []] as unknown as HistoryItem['prompt'],
          outputs: (j.result_urls ?? j.result ?? {}) as Record<string, Record<string, unknown>>,
          status: { status_str: (j.status ?? 'unknown') as string, completed: j.status === 'completed' || j.status === 'succeeded' },
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

export const apiClient = new ApiClient();

export async function fetchSystemStats(): Promise<SystemStats> {
  const stats = await apiClient.getSystemStats();
  return { ...stats, apiVersion: null } as SystemStats;
}
