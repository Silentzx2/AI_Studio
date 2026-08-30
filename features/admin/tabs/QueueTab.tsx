"use client";


import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Trash2, Activity, Users, Clock, Zap, RefreshCw, AlertCircle } from 'lucide-react';
import { GlassCard } from '@/components/premium/GlassCard';
import { MetricCard } from '@/components/premium/MetricCard';
import { Badge } from '@/components/premium/Badge';
import { NeonButton } from '@/components/premium/NeonButton';
import { StatusDot } from '@/components/premium/StatusDot';
import { Spinner } from '@/components/premium/Spinner';
import { adminService } from '@/services/adminService';
import type { QueueStatus } from '@/types';
import { toast } from 'sonner';

export function QueueTab() {
  const [queue, setQueue] = useState<QueueStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await adminService.queueStatus();
      setQueue(data);
      setError(!data ? 'Failed to load queue status' : null);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    setTimeout(() => load(), 0);
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      load();
    }, 15000);
    return () => clearInterval(interval);
  }, [load]);

  const handlePurge = async () => {
    try {
      await adminService.purgeQueue();
      toast.success('Queue purged');
      setQueue((prev) => prev ? { ...prev, queued: 0 } : null);
    } catch {
      toast.error('Failed to purge queue');
    }
  };

  if (loading && !queue) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error && !queue) {
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
    <div className="p-4 lg:p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Job Queue</h1>
          <p className="text-sm text-muted-foreground mt-1">Celery task queue monitoring</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 rounded-xl glass border border-[hsl(var(--border)/0.5)] text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
          <NeonButton variant="destructive" size="sm" onClick={handlePurge}>
            <Trash2 className="w-3.5 h-3.5" /> Purge Queue
          </NeonButton>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Active" value={queue?.active ?? 0} icon={Activity} color="purple" delay={0.05} />
        <MetricCard label="Queued" value={queue?.queued ?? 0} icon={Clock} color="blue" delay={0.1} />
        <MetricCard label="Reserved" value={queue?.reserved ?? 0} icon={Zap} color="cyan" delay={0.15} />
        <MetricCard label="Workers" value={queue?.workers ?? 0} icon={Users} color="green" delay={0.2} />
      </div>

      <GlassCard className="p-5" delay={0.25}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">Scheduler Status</h3>
          <div className="flex items-center gap-2">
            <StatusDot status={queue?.scheduler_running ? 'online' : 'offline'} size="sm" />
            <span className="text-xs text-muted-foreground">{queue?.scheduler_running ? 'Running' : 'Stopped'}</span>
          </div>
        </div>
        <div className="space-y-2">
          {Array.from({ length: queue?.workers ?? 0 }).map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 + i * 0.05 }}
              className="flex items-center justify-between p-3 rounded-xl glass border border-[hsl(var(--border)/0.3)]"
            >
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-surface-2">
                  <Users className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Worker {i + 1}</p>
                  <p className="text-xs text-muted-foreground">celery@worker-{i + 1}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="success">
                  <StatusDot status="online" size="sm" pulse={false} />
                  Active
                </Badge>
              </div>
            </motion.div>
          ))}
          {(queue?.workers ?? 0) === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="w-10 h-10 text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">No active workers</p>
            </div>
          )}
        </div>
      </GlassCard>
    </div>
  );
}
