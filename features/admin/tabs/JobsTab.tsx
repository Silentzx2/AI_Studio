"use client";

import { useEffect, useState, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Briefcase,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  Wrench,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { GlassCard } from '@/components/premium/GlassCard';
import { Badge } from '@/components/premium/Badge';
import { ProgressBar } from '@/components/premium/ProgressBar';
import { Spinner } from '@/components/premium/Spinner';
import { adminService } from '@/services/adminService';
import { diagnoseJobError, type JobDiagnostic } from '@/lib/jobDiagnostics';
import type { AdminJob } from '@/types';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const STATUS_CONFIG = {
  completed: { icon: CheckCircle, color: 'text-[hsl(var(--neon-green))]', bg: 'bg-[hsl(var(--neon-green)/0.1)]', label: 'Completed' },
  generating: { icon: Loader2, color: 'text-[hsl(var(--neon-purple))]', bg: 'bg-[hsl(var(--neon-purple)/0.1)]', label: 'Generating' },
  queued: { icon: Clock, color: 'text-[hsl(var(--neon-amber))]', bg: 'bg-[hsl(var(--neon-amber)/0.1)]', label: 'Queued' },
  failed: { icon: XCircle, color: 'text-[hsl(var(--destructive))]', bg: 'bg-[hsl(var(--destructive)/0.1)]', label: 'Failed' },
};

export function JobsTab() {
  const [jobs, setJobs] = useState<AdminJob[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [repairingJobs, setRepairingJobs] = useState<Record<string, boolean>>({});
  const [repairedJobs, setRepairedJobs] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    try {
      const data = await adminService.listJobs();
      setJobs(data);
      setError(data.length === 0 ? 'No jobs found' : null);
    } catch (e: any) {
      setError(e?.message || 'Failed to load jobs');
    } finally {
      setLoading(false);
    }
  }, []);

  // Adaptive polling: poll every 3.5s when active jobs or repairs exist; every 12s otherwise
  useEffect(() => {
    load();
    const hasActiveWork = jobs.some(j => j.status === 'generating' || j.status === 'queued') ||
      Object.keys(repairingJobs).some(k => repairingJobs[k]);

    const pollIntervalMs = hasActiveWork ? 3500 : 12000;

    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      load();
    }, pollIntervalMs);

    return () => clearInterval(interval);
  }, [load, jobs, repairingJobs]);

  const handleRepair = async (job: AdminJob, diag: JobDiagnostic) => {
    const key = job.id;
    setRepairingJobs(prev => ({ ...prev, [key]: true }));

    toast.info(`Initiating repair for ${diag.providerLabel}...`, {
      description: 'Re-initializing runtime environment, dependencies, and running preflight check.',
    });

    try {
      await adminService.repairProvider(diag.providerId);
      setRepairedJobs(prev => ({ ...prev, [key]: true }));
      toast.success(`${diag.providerLabel} runtime repair task queued`, {
        description: 'Virtualenv and preflight are being re-initialized. Status will update shortly.',
      });
      // Immediately refresh jobs
      await load();
    } catch (err: any) {
      toast.error(`Repair failed for ${diag.providerLabel}`, {
        description: err?.message || 'Unable to trigger provider repair.',
      });
    } finally {
      setRepairingJobs(prev => ({ ...prev, [key]: false }));
    }
  };

  const filtered = jobs.filter((j) => filter === 'all' || j.status === filter);
  const repairableJobsCount = jobs.filter(j => diagnoseJobError(j) !== null).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error && jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertCircle className="w-10 h-10 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">{error}</p>
        <button onClick={() => { setLoading(true); load(); }} className="text-xs text-[hsl(var(--neon-purple))] hover:underline flex items-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-[1600px] mx-auto">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Generation Jobs</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {filtered.length} jobs · {jobs.filter(j => j.status === 'completed').length} completed · {jobs.filter(j => j.status === 'failed').length} failed
            {repairableJobsCount > 0 && (
              <span className="ml-2 text-[hsl(var(--destructive))] font-medium">
                ({repairableJobsCount} runtime {repairableJobsCount === 1 ? 'error' : 'errors'} repairable)
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => { setLoading(true); load(); }}
          title="Refresh jobs"
          className="p-2 rounded-xl glass border border-[hsl(var(--border))] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        {['all', 'generating', 'queued', 'completed', 'failed'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'px-3 py-1.5 rounded-xl text-xs font-medium capitalize transition-all border cursor-pointer',
              filter === f
                ? 'bg-[hsl(var(--neon-purple)/0.15)] text-foreground border-[hsl(var(--neon-purple)/0.3)]'
                : 'glass text-muted-foreground border-[hsl(var(--border))] hover:text-foreground'
            )}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.map((job, i) => {
          const cfg = STATUS_CONFIG[job.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.queued;
          const Icon = cfg.icon;
          const diag = diagnoseJobError(job);
          const isRepairing = Boolean(repairingJobs[job.id]);
          const isRepaired = Boolean(repairedJobs[job.id]);

          return (
            <motion.div key={job.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <GlassCard hover className="p-4">
                <div className="flex items-start gap-4">
                  <div className={cn('flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0 mt-0.5', cfg.bg)}>
                    <Icon className={cn('w-5 h-5', cfg.color, job.status === 'generating' && 'animate-spin')} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-sm font-mono text-foreground font-semibold">{job.id}</span>
                      <Badge variant="default">{job.type}</Badge>
                      {job.provider && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] text-muted-foreground">
                          {job.provider}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Created: {new Date(job.created_at).toLocaleString()}
                      {job.completed_at && ` · Completed: ${new Date(job.completed_at).toLocaleString()}`}
                    </p>

                    {/* Standard Error Display */}
                    {!diag && job.error && (
                      <p className="text-xs text-[hsl(var(--destructive))] mt-1 font-mono break-all">{job.error}</p>
                    )}

                    {/* Interpreted RuntimeError Diagnosis & Try Repair Action */}
                    {diag && (
                      <div className="mt-2.5 p-3 rounded-xl bg-[hsl(var(--destructive)/0.08)] border border-[hsl(var(--destructive)/0.25)] space-y-2">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-[hsl(var(--destructive))]">
                              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                              <span>{diag.issueDescription}</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground font-mono break-all pl-5">
                              {job.error || job.error_message}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 pl-5 sm:pl-0">
                            {isRepaired && !isRepairing && (
                              <span className="text-[11px] text-[hsl(var(--neon-green))] flex items-center gap-1 font-medium">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Repaired
                              </span>
                            )}
                            <button
                              id={`btn-repair-job-${job.id}`}
                              type="button"
                              onClick={() => handleRepair(job, diag)}
                              disabled={isRepairing}
                              className={cn(
                                "px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer whitespace-nowrap",
                                isRepairing
                                  ? "bg-[hsl(var(--surface-3))] text-muted-foreground cursor-wait"
                                  : "bg-[hsl(var(--destructive))] text-white hover:bg-[hsl(var(--destructive)/0.85)] hover:shadow"
                              )}
                            >
                              {isRepairing ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  <span>Repairing Runtime...</span>
                                </>
                              ) : (
                                <>
                                  <Wrench className="w-3.5 h-3.5" />
                                  <span>Try Repair ({diag.providerLabel})</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>

                        <div className="text-[10px] text-muted-foreground pl-5 border-t border-[hsl(var(--destructive)/0.15)] pt-1.5">
                          💡 <span className="font-medium text-foreground">Remedy:</span> {diag.suggestedAction}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="w-28 sm:w-32 flex-shrink-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">{cfg.label}</span>
                      <span className="text-xs font-mono text-foreground">{job.progress}%</span>
                    </div>
                    <ProgressBar value={job.progress} color={job.status === 'completed' ? 'green' : job.status === 'failed' ? 'pink' : 'purple'} size="sm" />
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Briefcase className="w-12 h-12 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No jobs found</p>
        </div>
      )}
    </div>
  );
}

