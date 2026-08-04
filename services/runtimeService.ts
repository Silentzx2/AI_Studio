import { apiClient } from './apiClient';
import type { ApiResponse, RuntimeOptions, RuntimeStatus, SystemVerification, ProviderOption } from '@/types';

export type { ProviderOption } from '@/types';

interface RuntimeConfig {
  cuda_device?: string;
  max_vram_mb?: number;
  cpu_threads?: string;
  render_quality?: string;
  resolution?: string;
  texture_resolution?: string;
  output_format?: string;
  texture_model?: string;
  rigging_provider?: string;
}

type ApiEnvelope<T> = ApiResponse<T> | T;

function unwrap<T>(response: ApiEnvelope<T>): T {
  if (
    response &&
    typeof response === 'object' &&
    'data' in response &&
    ('success' in response || 'message' in response || 'errors' in response)
  ) {
    return (response as ApiResponse<T>).data;
  }
  return response as T;
}

function normalizeProviderOption(model: ProviderOption): ProviderOption {
  return {
    ...model,
    available: Boolean(model.available),
    vramMb: model.vramMb ?? model.vram_required_mb ?? 0,
  };
}

function normalizeRuntimeOptions(options: RuntimeOptions): RuntimeOptions {
  const rawVramLimits = (options?.vram_limits ?? []) as Array<number | { id: number | string; label?: string }>;

  return {
    ...options,
    three_d_models: (options?.three_d_models ?? []).map(normalizeProviderOption),
    texture_models: (options?.texture_models ?? []).map(normalizeProviderOption),
    rigging_providers: (options?.rigging_providers ?? []).map(normalizeProviderOption),
    render_qualities: (options?.render_qualities ?? []).map(normalizeProviderOption),
    resolutions: (options?.resolutions ?? []).map(normalizeProviderOption),
    texture_resolutions: (options?.texture_resolutions ?? []).map(normalizeProviderOption),
    output_formats: (options?.output_formats ?? []).map(normalizeProviderOption),
    gpu_options: (options?.gpu_options ?? []).map(normalizeProviderOption),
    vram_limits: rawVramLimits
      .map((limit) => typeof limit === 'number' ? limit : Number(limit.id))
      .filter((limit) => Number.isFinite(limit)),
    active_provider: options?.active_provider ?? '',
  };
}

function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeRuntimeStatus(raw: unknown): RuntimeStatus {
  const data = unwrap(raw as ApiEnvelope<Record<string, any>>) || {};
  const engine = data.engine ?? {};
  const system = data.system ?? {};
  const gpu = engine.gpu ?? data.gpu ?? system.gpu ?? {};
  const cuda = system.cuda ?? {};
  const blender = system.blender ?? {};
  const resources = system.system_resources ?? {};
  const repositories = system.repositories ?? {};
  const weights = system.weights ?? {};
  const services = system.services ?? {};
  const devices = gpu.devices ?? [];
  const firstDevice = devices[0] ?? {};

  const totalVram = asNumber(data.vram_total_mb ?? gpu.total_vram_mb ?? firstDevice.vram_mb);
  const freeVram = asNumber(data.vram_free_mb ?? gpu.free_vram_mb ?? firstDevice.free_vram_mb, totalVram);
  const usedVram = asNumber(data.vram_used_mb, Math.max(0, totalVram - freeVram));
  const diskTotal = asNumber(data.storage_total_gb ?? resources.disk_total_gb);
  const diskFree = asNumber(resources.disk_free_gb);

  return {
    engine_initialized: Boolean(data.engine_initialized ?? engine.initialized),
    cuda_available: Boolean(data.cuda_available ?? gpu.available ?? cuda.available),
    cuda_version: String(data.cuda_version ?? gpu.cuda_version ?? cuda.version ?? ''),
    driver_version: String(data.driver_version ?? gpu.driver_version ?? ''),
    gpu_name: String(data.gpu_name ?? firstDevice.name ?? ''),
    gpu_utilization: asNumber(data.gpu_utilization ?? firstDevice.utilization),
    gpu_temp: asNumber(data.gpu_temp ?? firstDevice.temperature),
    vram_used_mb: usedVram,
    vram_total_mb: totalVram,
    cpu_usage: asNumber(data.cpu_usage ?? resources.cpu_percent),
    cpu_name: String(data.cpu_name ?? resources.cpu_model ?? ''),
    ram_usage: asNumber(data.ram_usage ?? resources.ram_percent),
    ram_total: asNumber(data.ram_total, asNumber(resources.ram_total_gb) * 1024),
    os: String(data.os ?? system.environment?.platform ?? ''),
    network_in: asNumber(data.network_in ?? resources.network_bytes_recv, 0) / (1024 * 1024),
    network_out: asNumber(data.network_out ?? resources.network_bytes_sent, 0) / (1024 * 1024),
    storage_used_gb: asNumber(data.storage_used_gb, Math.max(0, diskTotal - diskFree)),
    storage_total_gb: diskTotal,
    blender_available: Boolean(data.blender_available ?? blender.available),
    blender_version: String(data.blender_version ?? blender.version ?? ''),
    repos_installed: asNumber(data.repos_installed ?? repositories.found),
    repos_total: asNumber(data.repos_total ?? repositories.total),
    weights_downloaded: Boolean(data.weights_downloaded ?? (weights.total > 0 && weights.found === weights.total)),
    scheduler_running: Boolean(data.scheduler_running ?? services.redis?.available),
    workers: asNumber(data.workers),
    loaded_providers: data.loaded_providers ?? engine.loaded_providers ?? [],
  };
}

function normalizeVerification(raw: unknown): SystemVerification {
  const data = unwrap(raw as ApiEnvelope<Record<string, any>>) || {};

  return {
    ...data,
    cuda_available: Boolean(data.cuda_available),
    gpu_detected: Boolean(data.gpu_detected ?? data.gpu_available ?? data.cuda_available),
    blender_available: Boolean(data.blender_available),
    repos_installed: Boolean(data.repos_installed ?? data.repos_cloned),
    weights_downloaded: Boolean(data.weights_downloaded),
    issues: Array.isArray(data.issues) ? data.issues : [],
  } as SystemVerification;
}

export const runtimeService = {
  async getOptions(): Promise<RuntimeOptions | null> {
    try {
      const response = await apiClient.get<ApiEnvelope<RuntimeOptions>>('/api/v1/runtime/options');
      return normalizeRuntimeOptions(unwrap(response));
    } catch {
      return null;
    }
  },

  async getStatus(): Promise<RuntimeStatus | null> {
    try {
      const response = await apiClient.get<ApiEnvelope<Record<string, any>>>('/api/v1/runtime/status');
      return normalizeRuntimeStatus(response);
    } catch {
      return null;
    }
  },

  async install(repos: string | string[], models?: string | string[]): Promise<void> {
    const repoArray = Array.isArray(repos) ? repos : [repos];
    const modelArray = models ? (Array.isArray(models) ? models : [models]) : repoArray;
    await apiClient.post('/api/v1/runtime/install', { repos: repoArray, models: modelArray });
  },

  async updateConfig(config: RuntimeConfig): Promise<void> {
    await apiClient.post('/api/v1/runtime/config', config);
  },

  async updateRepo(repo: string): Promise<void> {
    await apiClient.post('/api/v1/runtime/update', { repo });
  },

  async repairRepo(repo: string): Promise<void> {
    await apiClient.post('/api/v1/runtime/repair', { repo });
  },

  async removeRepo(repo: string): Promise<void> {
    await apiClient.post('/api/v1/runtime/remove', { repo });
  },

  async verify(): Promise<SystemVerification> {
    const response = await apiClient.post<ApiEnvelope<Record<string, any>>>('/api/v1/runtime/verify');
    return normalizeVerification(response);
  },

  async restartRuntime(): Promise<void> {
    await apiClient.post('/api/v1/runtime/restart');
  },

  async clearCache(): Promise<void> {
    await apiClient.post('/api/v1/runtime/clear-cache');
  },

  async clearVRAM(): Promise<void> {
    await apiClient.post('/api/v1/runtime/clear-vram');
  },

  async switchProvider(provider: string): Promise<void> {
    await apiClient.post('/api/v1/runtime/provider', { provider });
  },

  async getHFTokenStatus(): Promise<{ configured: boolean; valid: boolean; masked?: string }> {
    try {
      const response = await apiClient.get<ApiEnvelope<{ configured: boolean; valid?: boolean; masked?: string }>>('/api/v1/runtime/hf-token');
      const status = unwrap(response);
      return { configured: Boolean(status.configured), valid: Boolean(status.valid), masked: status.masked };
    } catch {
      return { configured: false, valid: false };
    }
  },

  async setHFToken(token: string): Promise<void> {
    await apiClient.post('/api/v1/runtime/hf-token', { token });
  },

  async removeHFToken(): Promise<void> {
    await apiClient.delete('/api/v1/runtime/hf-token');
  },

  async verifyHFToken(): Promise<boolean> {
    try {
      const response = await apiClient.post<ApiEnvelope<{ valid: boolean }>>('/api/v1/runtime/hf-token/verify');
      const result = unwrap(response);
      return Boolean(result.valid);
    } catch {
      return false;
    }
  },
};
