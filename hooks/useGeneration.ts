"use client";


import { useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { useGenerationStore } from '@/stores/useGenerationStore';
import { generationService } from '@/services/generationService';
import { uploadService } from '@/services/uploadService';
import type { GenerationConfig, GenerationJob } from '@/types';

function createJob(config: GenerationConfig): GenerationJob {
  return {
    id: Math.random().toString(36).slice(2), status: 'queued', config, progress: 0,
    estimatedSeconds: 60, elapsedSeconds: 0, logs: [], createdAt: new Date(), updatedAt: new Date(),
  };
}

export function useGeneration() {
  const { mode, uploadedImage, currentJob, getConfig, setCurrentJob, updateJobProgress, addLogEntry, addRecentPrompt, cancelJob } = useGenerationStore();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  const startElapsedTimer = useCallback((jobId: string) => {
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      useGenerationStore.setState((s) => {
        if (!s.currentJob || s.currentJob.id !== jobId) return {};
        return { currentJob: { ...s.currentJob, elapsedSeconds: elapsed } };
      });
    }, 1000);
  }, []);

  const stopElapsedTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const generate = useCallback(async () => {
    let config = getConfig();
    if (mode === 'text-to-3d' && !config.prompt.trim()) { toast.error('Please enter a prompt to generate a 3D model.'); return; }
    if (mode === 'image-to-3d' && !uploadedImage) { toast.error('Please upload a reference image.'); return; }

    const job = createJob(config);
    setCurrentJob(job);
    startElapsedTimer(job.id);
    toast.info('Generation started', { description: 'Your 3D model is being created...' });

    try {
      if (mode === 'image-to-3d' && uploadedImage) {
        updateJobProgress(job.id, 3, 'uploading');
        addLogEntry(job.id, 'Uploading reference image...', 'info');
        const uploaded = await uploadService.upload(uploadedImage.file);
        config = { ...config, referenceImage: uploaded.url };
        // BUG-05 FIX: sync the server URL back into the store so job history shows
        // the permanent URL, not the stale pre-upload blob URL from the closure.
        useGenerationStore.setState((s) => ({
          currentJob: s.currentJob?.id === job.id
            ? { ...s.currentJob, config }
            : s.currentJob,
        }));
        addLogEntry(job.id, 'Reference image uploaded', 'success');
      }

      const result = await generationService.startGeneration(config, (progress, status, log, level) => {
        updateJobProgress(job.id, progress, status);
        addLogEntry(job.id, log, level);
      });
      // BUG-05 FIX: read the fresh job from the store (which has the updated config with
      // referenceImage after upload) instead of spreading the stale closure `job`.
      const latestJob = useGenerationStore.getState().currentJob ?? job;
      setCurrentJob({ ...latestJob, status: 'completed', progress: 100, result, updatedAt: new Date() });
      addRecentPrompt({ id: job.id, text: config.prompt, mode: config.mode, thumbnailUrl: result.thumbnailUrl, createdAt: new Date() });
      toast.success('Model generated!', { description: 'Your 3D model is ready for download.' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message === 'Generation cancelled') { toast.warning('Generation cancelled'); }
      else {
        const current = useGenerationStore.getState().currentJob;
        if (current) { useGenerationStore.getState().setCurrentJob({ ...current, status: 'failed', updatedAt: new Date() }); }
        toast.error('Generation failed', { description: message });
      }
    } finally { stopElapsedTimer(); }
  }, [mode, uploadedImage, getConfig, setCurrentJob, updateJobProgress, addLogEntry, addRecentPrompt, startElapsedTimer, stopElapsedTimer]);

  const cancel = useCallback(() => { generationService.cancel(); cancelJob(); stopElapsedTimer(); }, [cancelJob, stopElapsedTimer]);
  const isGenerating = currentJob ? !['completed', 'failed', 'cancelled', 'idle'].includes(currentJob.status) : false;
  return { generate, cancel, isGenerating, currentJob };
}
