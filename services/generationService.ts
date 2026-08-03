import type { GenerationConfig, GenerationResult, LogEntry } from '@/types';

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
  async startGeneration(config: GenerationConfig, onProgress: ProgressCallback): Promise<GenerationResult> {
    // BUG-03 FIX: local scope controller, registered in shared Set
    const abortController = new AbortController();
    _activeControllers.add(abortController);

    onProgress(5, 'queued', 'Job queued — waiting for GPU slot', 'info');

    // Issue #3 Fix: Use correct endpoint without /start suffix
    const response = await fetch('/api/v1/generation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toBackendPayload(config)),
      signal: abortController.signal,
    });

    if (!response.ok) {
      const msg = await response.text().catch(() => 'Generation failed');
      throw new Error(msg);
    }

    const data = await response.json();
    if (data?.success === false) {
      throw new Error(data?.message || 'Generation failed');
    }
    const jobId = data?.data?.job_id || data?.job_id || data?.id;

    if (!jobId) {
      return normalizeResult(data?.data || data);
    }

    onProgress(10, 'generating', 'Generation started', 'info');

    return new Promise<GenerationResult>((resolve, reject) => {
      // BUG-04 FIX: added retry counter for backoff (was missing; image service has it)
      let pollRetryCount = 0;
      const poll = async () => {
        try {
          // Issue #3 Fix: Backend now has GET /generation/{job_id}/status endpoint
          const statusRes = await fetch(`/api/v1/generation/${jobId}/status`, {
            signal: abortController?.signal,
          });
          if (!statusRes.ok) {
            // If status endpoint fails, try to get from history
            if (statusRes.status === 404) {
              throw new Error('Status endpoint not found - backend may need update');
            }
            throw new Error('Failed to fetch status');
          }
          const statusData = await statusRes.json();
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

          // BUG-04 FIX: reset retry counter on every successful poll
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
          // BUG-04 FIX: was an immediate reject() — any transient network error killed the job.
          // Now retry with exponential backoff up to 5 times.
          pollRetryCount++;
          if (pollRetryCount > 5) {
            reject(new Error(err instanceof Error ? err.message : 'Polling failed'));
            return;
          }
          setTimeout(poll, 2000 * pollRetryCount); // 2s, 4s, 6s, 8s, 10s
        }
      };

      setTimeout(poll, 1000);
    }).finally(() => {
      // BUG-03 FIX: remove controller from active set when generation finishes/errors/cancels
      _activeControllers.delete(abortController);
    });
  },

  cancel() {
    // BUG-03 FIX: abort every active controller, not just the last-assigned module-level one
    for (const c of _activeControllers) c.abort();
    _activeControllers.clear();
  },
};
