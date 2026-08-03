import { apiClient } from './apiClient';
import type { AdminOverview, AdminLog, AdminJob, AdminModel, QueueStatus, DockerService, TerminalCommand, InstallProgress, PipelineSnapshot } from '@/types';

/**
 * Admin Service - handles all admin panel API calls
 *
 * FIXES APPLIED (Issues #4, #7, #8):
 * - modelAction now uses correct body-based endpoint
 * - Install progress uses /install/progress/{id} (backend route)
 * - Types aligned with actual backend responses
 */
export const adminService = {
  async overview(): Promise<AdminOverview | null> {
    try {
      const res = await apiClient.get<{ data: AdminOverview }>('/api/v1/admin/overview');
      return res?.data || null;
    } catch {
      return null;
    }
  },

  async system(): Promise<Record<string, unknown> | null> {
    try {
      const res = await apiClient.get<{ data: Record<string, unknown> }>('/api/v1/admin/system');
      return res?.data || null;
    } catch {
      return null;
    }
  },

  async deepHealth(): Promise<{ status: string; checks: Record<string, unknown> }> {
    const res = await apiClient.get<{ data: { status: string; checks: Record<string, unknown> } }>('/api/v1/admin/health/deep');
    if (res?.data?.checks && Object.keys(res.data.checks).length > 0) {
      return res.data;
    }
    throw new Error('Failed to load deep health data');
  },

  async getLogs(limit = 100, level?: string): Promise<AdminLog[]> {
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (level) params.set('level', level);
      const res = await apiClient.get<{ data: { logs: any[] } }>(`/api/v1/admin/logs?${params}`);
      const rawLogs = res?.data?.logs || [];
      return rawLogs.map((log: any, index: number) => ({
        id: log.id || `log-${index}-${Date.now()}`,
        timestamp: log.timestamp || log.ts || new Date().toISOString(),
        level: (log.level || 'info').toLowerCase(),
        source: log.source || log.logger || 'system',
        message: log.message || '',
      }));
    } catch {
      return [];
    }
  },

  async clearLogs(): Promise<void> {
    await apiClient.delete('/api/v1/admin/logs');
  },

  async queueStatus(): Promise<QueueStatus | null> {
    try {
      const res = await apiClient.get<{ data: QueueStatus }>('/api/v1/admin/queue');
      return res?.data || null;
    } catch {
      return null;
    }
  },

  async purgeQueue(): Promise<void> {
    await apiClient.post('/api/v1/admin/queue/purge');
  },

  async listJobs(): Promise<AdminJob[]> {
    try {
      const res = await apiClient.get<{ data: { jobs: AdminJob[] } }>('/api/v1/admin/jobs');
      return res?.data?.jobs || [];
    } catch {
      return [];
    }
  },

  async listModels(): Promise<AdminModel[]> {
    try {
      const res = await apiClient.get<{ data: { models: AdminModel[] } }>('/api/v1/admin/models');
      return res?.data?.models || [];
    } catch {
      return [];
    }
  },

  async getPipelines(): Promise<PipelineSnapshot | null> {
    try {
      const res = await apiClient.get<{ data: PipelineSnapshot }>('/api/v1/pipelines');
      return res?.data || null;
    } catch {
      return null;
    }
  },

  async togglePipeline(modelId: string, enabled: boolean): Promise<PipelineSnapshot | null> {
    try {
      const res = await apiClient.post<{ data: { snapshot: PipelineSnapshot } }>(`/api/v1/pipelines/${modelId}/toggle`, { enabled });
      return res?.data?.snapshot || null;
    } catch {
      return null;
    }
  },

  /**
   * Trigger a model action (install, uninstall, load, etc.)
   * Issue #7 Fix: Uses body-based endpoint instead of path-based
   */
  async modelAction(modelId: string, action: 'install' | 'uninstall' | 'update' | 'load' | 'unload' | 'cancel'): Promise<void> {
    await apiClient.post('/api/v1/admin/models/action', {
      model_id: modelId,
      action,
    });
  },

  /**
   * Get installation progress for a model
   * Issue #4 Fix: Uses correct endpoint path
   */
  async getInstallProgress(modelId: string): Promise<InstallProgress | null> {
    try {
      const res = await apiClient.get<{ data: InstallProgress }>(`/api/v1/admin/install/progress/${modelId}`);
      return res?.data || null;
    } catch {
      return null;
    }
  },

  /**
   * Stream installation progress via SSE.
   * Normalises the raw backend payload (bytes/bps) into the
   * InstallProgress shape the UI expects (MB/MBps).
   *
   * FINAL_FIX_REPORT: Changed - Added timeout protection, eventSourceClosed flag,
   * auto-cleanup on completion, and proper resource management to prevent memory leaks.
   */
  streamInstallProgress(
    modelId: string,
    onProgress: (progress: InstallProgress) => void,
    onDone?: () => void,
    timeout: number = 3600000  // 1 hour default timeout
  ): () => void {
    let timeoutId: NodeJS.Timeout | null = null;
    let eventSourceClosed = false;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      eventSourceClosed = true;
      if (onDone) onDone();
    };

    // Set timeout for the entire stream
    timeoutId = setTimeout(() => {
      if (!eventSourceClosed) {
        console.warn(`Install stream for ${modelId} timed out`);
        cleanup();
      }
    }, timeout);

    const unsubscribe = apiClient.streamEvents(
      `/api/v1/admin/install/stream/${modelId}`,
      (raw) => {
        if (eventSourceClosed) return;

        const d = raw as Record<string, unknown>;
        const bytesToMB = (b?: number) => ((b ?? 0) / (1024 * 1024));
        const progress: InstallProgress = {
          model_id: String(d.model_id ?? modelId),
          phase: String(d.phase ?? ''),
          progress: Number(d.percent ?? d.progress ?? 0),
          percent: Number(d.percent ?? 0),
          speed_mbps: d.speed_mbps != null ? Number(d.speed_mbps) : bytesToMB(Number(d.speed_bps)),
          speed_bps: d.speed_bps != null ? Number(d.speed_bps) : undefined,
          downloaded_mb: d.downloaded_mb != null ? Number(d.downloaded_mb) : bytesToMB(Number(d.bytes_downloaded)),
          bytes_downloaded: d.bytes_downloaded != null ? Number(d.bytes_downloaded) : undefined,
          total_mb: d.total_mb != null ? Number(d.total_mb) : bytesToMB(Number(d.bytes_total)),
          bytes_total: d.bytes_total != null ? Number(d.bytes_total) : undefined,
          eta_seconds: Number(d.eta_seconds ?? 0),
          status: d.status as InstallProgress['status'],
          log: d.log != null ? String(d.log) : undefined,
          error: d.error != null ? String(d.error) : undefined,
        };

        onProgress(progress);

        // Cleanup when done
        if (progress.status === 'completed' || progress.status === 'failed') {
          cleanup();
        }
      },
      cleanup
    );

    // Return function that properly cleans up resources
    return () => {
      eventSourceClosed = true;
      unsubscribe();
      cleanup();
    };
  },

  async dockerStatus(): Promise<DockerService[]> {
    try {
      const res = await apiClient.get<{ data: { containers: DockerService[] } }>('/api/v1/admin/docker/status');
      return res?.data?.containers || [];
    } catch {
      return [];
    }
  },

  async dockerAction(service: string, action: 'start' | 'stop' | 'restart'): Promise<void> {
    await apiClient.post('/api/v1/admin/docker/action', { service, action });
  },

  async dockerLogs(service: string): Promise<string[]> {
    try {
      const res = await apiClient.get<{ data: { lines: string[] } }>(`/api/v1/admin/docker/logs/${service}`);
      return res?.data?.lines || [];
    } catch {
      return [];
    }
  },

  async runCommand(command: string): Promise<TerminalCommand> {
    const res = await apiClient.post<{ data: TerminalCommand }>('/api/v1/admin/terminal', { command });
    return res?.data || { id: '', command: '', output: '', timestamp: '', exit_code: 1 };
  },

  async commandHistory(): Promise<TerminalCommand[]> {
    try {
      const res = await apiClient.get<{ data: { history: TerminalCommand[] } }>('/api/v1/admin/terminal/history');
      return res?.data?.history || [];
    } catch {
      return [];
    }
  },

  async getHFTokenStatus(): Promise<{ configured: boolean; valid: boolean }> {
    try {
      const res = await apiClient.get<{ data: { configured: boolean; valid: boolean } }>('/api/v1/admin/settings/hf-token');
      return res?.data || { configured: false, valid: false };
    } catch {
      return { configured: false, valid: false };
    }
  },

  async saveHFToken(token: string): Promise<void> {
    await apiClient.post('/api/v1/admin/settings/hf-token', { token });
  },

  async getSettings(): Promise<Record<string, unknown> | null> {
    try {
      const res = await apiClient.get<{ data: Record<string, unknown> }>('/api/v1/admin/settings');
      return res?.data || null;
    } catch {
      return null;
    }
  },

  streamAdminLogs(
    onLog: (entry: AdminLog) => void,
    limit = 50
  ): () => void {
    return apiClient.streamEvents(
      `/api/v1/admin/logs/stream?last_n=${limit}`,
      (raw: any) => {
        if (!raw || (!raw.message && !raw.msg)) return;
        onLog({
          id: raw.id || `log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          timestamp: raw.timestamp || raw.ts || new Date().toISOString(),
          level: (raw.level || 'info').toLowerCase(),
          source: raw.source || raw.logger || 'system',
          message: raw.message || raw.msg || '',
        });
      }
    );
  },
};
