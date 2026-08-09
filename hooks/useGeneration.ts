"use client";

import { useCallback, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { useGenerationStore } from '@/stores/useGenerationStore';
import { useAppStore } from '@/stores/useAppStore';
import { useTaskManager } from '@/hooks/useTaskManager';
import { getEventBus } from '@/hooks/useEventBus';
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
  const { registerTask, updateTask, completeTask } = useTaskManager();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const eventBus = getEventBus();

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

  useEffect(() => {
    if (currentJob && !['completed', 'failed', 'cancelled', 'idle'].includes(currentJob.status)) {
      registerTask({
        id: currentJob.id,
        type: 'generation',
        status: currentJob.status as 'queued' | 'running' | 'completed' | 'failed' | 'cancelled',
        progress: currentJob.progress,
        label: currentJob.config.prompt || 'Generation',
        createdAt: currentJob.createdAt.getTime(),
        updatedAt: currentJob.updatedAt.getTime(),
      });
    }
  }, []);

  const generate = useCallback(async () => {
    let config = getConfig();
    if (mode === 'text-to-3d' && !config.prompt.trim()) { toast.error('Please enter a prompt to generate a 3D model.'); return; }
    if (mode === 'image-to-3d' && !uploadedImage) { toast.error('Please upload a reference image.'); return; }

    const job = createJob(config);
    setCurrentJob(job);
    startElapsedTimer(job.id);
    toast.info('Generation started', { description: 'Your 3D model is being created...' });

    registerTask({
      id: job.id,
      type: 'generation',
      status: 'queued',
      progress: 0,
      label: config.prompt || 'Generation',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    eventBus.emit('generation:started', { jobId: job.id });

    try {
      if (mode === 'image-to-3d' && uploadedImage) {
        updateJobProgress(job.id, 3, 'uploading');
        addLogEntry(job.id, 'Uploading reference image...', 'info');
        const uploaded = await uploadService.uploadWithProgress(
          uploadedImage.file,
          (progress) => {
            const uploadPercent = Math.round((progress.loaded / progress.total) * 100);
            updateJobProgress(job.id, 3 + Math.round(uploadPercent * 0.1), 'uploading');
            addLogEntry(job.id, `Uploading... ${uploadPercent}%`, 'info');
          }
        );
        config = { ...config, referenceImage: uploaded.url };
        useGenerationStore.setState((s) => ({
          currentJob: s.currentJob?.id === job.id
            ? { ...s.currentJob, config }
            : s.currentJob,
        }));
        addLogEntry(job.id, 'Reference image uploaded', 'success');
      }

      updateTask(job.id, { status: 'running', progress: 5 });

      const localJobId = job.id;
      const result = await generationService.startGeneration(
        config,
        (progress, status, log, level) => {
          updateJobProgress(job.id, progress, status);
          addLogEntry(job.id, log, level);
          updateTask(job.id, { progress, status: status as 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' });
        },
        (backendJobId: string) => {
          // ponytail: unify on the backend UUID. Mutate the local ref so all
          // later callbacks (updateJobProgress/updateTask) use it, and move the
          // task + currentJob to the backend id so SSE/task-pollers stop 404ing
          // on the local placeholder id.
          job.id = backendJobId;
          const cur = useGenerationStore.getState().currentJob;
          if (cur && cur.id !== backendJobId) {
            setCurrentJob({ ...cur, id: backendJobId });
          }
          const tasks = useAppStore.getState().tasks;
          if (localJobId !== backendJobId && tasks[localJobId]) {
            const t = tasks[localJobId];
            useAppStore.getState().removeTask(localJobId);
            useAppStore.getState().setTask({ ...t, id: backendJobId });
          }
        },
      );

      const latestJob = useGenerationStore.getState().currentJob ?? job;
      setCurrentJob({ ...latestJob, status: 'completed', progress: 100, result, updatedAt: new Date() });
      addRecentPrompt({ id: job.id, text: config.prompt, mode: config.mode, thumbnailUrl: result.thumbnailUrl, createdAt: new Date() });
      completeTask(job.id, 'completed');
      eventBus.emit('generation:completed', { jobId: job.id, result });
      toast.success('Model generated!', { description: 'Your 3D model is ready for download.' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message === 'Generation cancelled') {
        toast.warning('Generation cancelled');
        completeTask(job.id, 'cancelled');
        eventBus.emit('generation:cancelled', { jobId: job.id });
      } else {
        const current = useGenerationStore.getState().currentJob;
        if (current) { useGenerationStore.getState().setCurrentJob({ ...current, status: 'failed', updatedAt: new Date() }); }
        completeTask(job.id, 'failed');
        eventBus.emit('generation:failed', { jobId: job.id, error: message });
        toast.error('Generation failed', { description: message });
      }
    } finally { stopElapsedTimer(); }
  }, [mode, uploadedImage, getConfig, setCurrentJob, updateJobProgress, addLogEntry, addRecentPrompt, startElapsedTimer, stopElapsedTimer, registerTask, updateTask, completeTask, eventBus]);

  const cancel = useCallback(() => {
    // Pass the backend job id (after it has been created) so the server marks
    // the job cancelled and stops the worker, not just the client poller.
    const backendJobId = currentJob?.id;
    generationService.cancel(backendJobId);
    cancelJob();
    stopElapsedTimer();
  }, [cancelJob, stopElapsedTimer, currentJob]);
  const isGenerating = currentJob ? !['completed', 'failed', 'cancelled', 'idle'].includes(currentJob.status) : false;
  return { generate, cancel, isGenerating, currentJob };
}
