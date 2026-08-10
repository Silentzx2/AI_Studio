import type { GenerationConfig, GenerationResult, LogEntry } from '@/types';
import { apiClient } from './apiClient';

type ProgressCallback = (progress: number, status: string, log: string, level: LogEntry['level']) => void;

// BUG-03 FIX: was a single module-level AbortController — caused identical race condition as
// the old single-controller approach. Now use a Set so every active generation gets its own controller.
const _activeControllers = new Set<AbortController>();

interface BackendGenerationResult {
  model_url?: string;
  thumbnail_url?: string;
  polygon_count?: number;
  vertex_count?: number;
  texture_resolution?: string;
  has_rig?: boolean;
  download_urls?: Record<string, string | null>;
  file_size?: number;
}

function toBackendPayload(config: GenerationConfig) {
  return {
    mode: config.mode,
    prompt: config.prompt,
    negative_prompt: config.negativePrompt,
    quality: config.quality,
    style_preset: config.stylePreset,
    generate_texture: config.generateTexture,
    auto_rig: config.autoRig,
    provider: config.model,
    reference_image_url: config.referenceImage,
  };
}

function normalizeStatus(status: string | undefined): string {
  if (!status || status === 'processing') return 'generating';
  return status;
}

function normalizeResult(result: BackendGenerationResult | GenerationResult): GenerationResult {
  const raw = result as BackendGenerationResult & GenerationResult;
  const downloadUrls = (raw.downloadUrls ?? raw.download_urls ?? {}) as Partial<Record<'glb' | 'fbx' | 'obj' | 'stl', string | null>>;

  return {
    modelUrl: raw.modelUrl ?? raw.model_url ?? downloadUrls.glb ?? '',
    thumbnailUrl: raw.thumbnailUrl ?? raw.thumbnail_url ?? '',
    polygonCount: raw.polygonCount ?? raw.polygon_count ?? 0,
    vertexCount: raw.vertexCount ?? raw.vertex_count ?? 0,
    textureResolution: raw.textureResolution ?? raw.texture_resolution,
    hasRig: raw.hasRig ?? raw.has_rig ?? false,
    downloadUrls: {
      ...downloadUrls,
      glb: downloadUrls.glb ?? raw.modelUrl ?? raw.model_url ?? undefined,
    } as GenerationResult['downloadUrls'],
    fileSize: raw.fileSize ?? raw.file_size ?? 0,
  };
}

/**
 * Generation Service - handles 3D model generation API calls
 *
 * FIXES APPLIED (Issue #3):
 * - Now uses correct endpoint /generation (no /start suffix)
 * - Status polling endpoint exists in fixed backend
 */
export const generationService = {
  async startGeneration(
    config: GenerationConfig,
    onProgress: ProgressCallback,
    onJobId?: (jobId: string) => void,
  ): Promise<GenerationResult> {
    // BUG-03 FIX: local scope controller, registered in shared Set
    const abortController = new AbortController();
    _activeControllers.add(abortController);

    onProgress(5, 'queued', 'Job queued — waiting for GPU slot', 'info');

    // Issue #3 Fix: Use correct endpoint without /start suffix
    const data = await apiClient.post<any>('/api/v1/generation', toBackendPayload(config));

    if (data?.success === false) {
      throw new Error(data?.message || 'Generation failed');
    }
    const jobId = data?.data?.job_id || data?.job_id || data?.id;

    if (!jobId) {
      return normalizeResult(data?.data || data);
    }

    // ponytail: surface the REAL backend job id to the caller so the store
    // (and any SSE/task-pollers) track the backend UUID, not the local
    // placeholder id. Without this, status polling hits a non-existent job
    // and returns 404 (e.g. /api/v1/generation/<localId>/status).
    onJobId?.(jobId);

    onProgress(10, 'generating', 'Generation started', 'info');

    // Use SSE if supported, otherwise fallback to polling
    if (typeof window !== 'undefined' && 'EventSource' in window) {
      const eventSource = new EventSource(`/api/v1/generation/${jobId}/stream`);
      
      return new Promise<GenerationResult>((resolve, reject) => {
        eventSource.onmessage = (event) => {
          try {
            const status = JSON.parse(event.data);
            onProgress(
              status.progress ?? 0,
              normalizeStatus(status.status),
              status.message ?? `Processing... ${status.progress ?? 0}%`,
              status.status === 'completed' ? 'success' : 'info'
            );

            if (status.status === 'completed') {
              eventSource.close();
              resolve(normalizeResult(status.result || status));
            } else if (status.status === 'failed') {
              eventSource.close();
              reject(new Error(status.error || 'Generation failed'));
            } else if (status.status === 'cancelled') {
              eventSource.close();
              reject(new Error('Generation cancelled'));
            }
          } catch (err) {
            console.error("Failed to parse SSE message:", err);
          }
        };

        eventSource.onerror = (err) => {
          console.warn("SSE connection error, falling back to polling:", err);
          eventSource.close();
          // Fallback to existing polling logic
          this._pollGeneration(jobId, abortController, onProgress, resolve, reject);
        };

        abortController.signal.addEventListener('abort', () => {
          eventSource.close();
          reject(new Error('Generation cancelled'));
        });
      }).finally(() => {
        _activeControllers.delete(abortController);
      });
    }

    // Fallback for environments without EventSource (or if SSE fails)
    return new Promise<GenerationResult>((resolve, reject) => {
      this._pollGeneration(jobId, abortController, onProgress, resolve, reject);
    }).finally(() => {
      _activeControllers.delete(abortController);
    });
  },

  async _pollGeneration(
    jobId: string,
    abortController: AbortController,
    onProgress: ProgressCallback,
    resolve: (res: GenerationResult) => void,
    reject: (err: any) => void
  ) {
    let pollRetryCount = 0;
    const poll = async () => {
      try {
        const statusData = await apiClient.get<any>(`/api/v1/generation/${jobId}/status`, false);
        if (statusData?.success === false) {
          throw new Error(statusData?.message || 'Failed to fetch status');
        }
        const status = statusData?.data || statusData;

        onProgress(
          status.progress ?? 0,
          normalizeStatus(status.status),
          status.message ?? `Processing... ${status.progress ?? 0}%`,
          status.status === 'completed' ? 'success' : 'info'
        );

        if (status.status === 'completed') {
          resolve(normalizeResult(status.result || status));
          return;
        }

        if (status.status === 'failed') {
          reject(new Error(status.error || 'Generation failed'));
          return;
        }

        if (abortController?.signal.aborted) {
          reject(new Error('Generation cancelled'));
          return;
        }

        pollRetryCount = 0;
        setTimeout(poll, 1000);
      } catch (err) {
        if (err instanceof Error && err.message === 'Generation cancelled') {
          reject(err);
          return;
        }
        if (abortController?.signal.aborted) {
          reject(new Error('Generation cancelled'));
          return;
        }
        pollRetryCount++;
        if (pollRetryCount > 5) {
          reject(new Error(err instanceof Error ? err.message : 'Polling failed'));
          return;
        }
        setTimeout(poll, 2000 * pollRetryCount);
      }
    };
    setTimeout(poll, 1000);
  },

  async cancel(jobId?: string) {
    // Abort the pollers first so the UI stops immediately, then tell the
    // backend to mark the job cancelled (single source of truth) so the worker
    // stops at the next stage boundary instead of running to completion.
    for (const c of _activeControllers) c.abort();
    _activeControllers.clear();
    if (jobId) {
      try {
        await apiClient.post(`/api/v1/generation/${jobId}/cancel`);
      } catch {
        // ponytail: best-effort — the AbortController above already stopped the UI.
      }
    }
  },
};
