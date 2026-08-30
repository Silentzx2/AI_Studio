"use client";


import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Briefcase, Clock, CheckCircle, XCircle, Loader2, RefreshCw, AlertCircle } from 'lucide-react';
import { GlassCard } from '@/components/premium/GlassCard';
import { Badge } from '@/components/premium/Badge';
import { ProgressBar } from '@/components/premium/ProgressBar';
import { Spinner } from '@/components/premium/Spinner';
import { adminService } from '@/services/adminService';
import type { AdminJob } from '@/types';
import { cn } from '@/lib/utils';

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

  const load = useCallback(async () => {
    const data = await adminService.listJobs();
    setJobs(data);
    setError(data.length === 0 ? 'No jobs found' : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      load();
    }, 30000);
    return () => clearInterval(interval);
  }, [load]);

  const filtered = jobs.filter((j) => filter === 'all' || j.status === filter);

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
          </p>
        </div>
        <button onClick={load} className="p-2 rounded-xl glass border border-[hsl(var(--border))] text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        {['all', 'generating', 'queued', 'completed', 'failed'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'px-3 py-1.5 rounded-xl text-xs font-medium capitalize transition-all border',
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
          return (
            <motion.div key={job.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <GlassCard hover className="p-4">
                <div className="flex items-center gap-4">
                  <div className={cn('flex items-center justify-center w-10 h-10 rounded-xl', cfg.bg)}>
                    <Icon className={cn('w-5 h-5', cfg.color, job.status === 'generating' && 'animate-spin')} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-mono text-foreground">{job.id}</span>
                      <Badge variant="default">{job.type}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Created: {new Date(job.created_at).toLocaleString()}
                      {job.completed_at && ` · Completed: ${new Date(job.completed_at).toLocaleString()}`}
                    </p>
                    {job.error && <p className="text-xs text-[hsl(var(--destructive))] mt-1">{job.error}</p>}
                  </div>
                  <div className="w-32">
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
