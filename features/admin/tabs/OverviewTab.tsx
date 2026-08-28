"use client";


import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Cpu, HardDrive, Zap, Activity, Box, Clock,
  AlertTriangle, CheckCircle, XCircle, Server,
  MemoryStick, Thermometer, Gauge, ScrollText, RefreshCw
} from 'lucide-react';
import { GlassCard } from '@/components/premium/GlassCard';
import { MetricCard } from '@/components/premium/MetricCard';
import { ProgressBar } from '@/components/premium/ProgressBar';
import { StatusDot } from '@/components/premium/StatusDot';
import { Badge } from '@/components/premium/Badge';
import { Spinner } from '@/components/premium/Spinner';
import { GpuVramLineChart } from '@/components/monitoring/GpuVramLineChart';
import { adminService } from '@/services/adminService';
import { runtimeService } from '@/services/runtimeService';
import type { AdminOverview, RuntimeStatus } from '@/types';

export function OverviewTab() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [ov, rt] = await Promise.all([
        adminService.overview(),
        runtimeService.getStatus(),
      ]);
      setOverview(ov);
      setRuntime(rt);
      setError(!ov && !rt ? 'Failed to load system data' : null);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    setTimeout(() => load(), 0);
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [load]);

  const quickActions = [
    { label: 'New Generation', icon: Box, color: 'purple' as const, href: '/workspace' },
    { label: 'Manage Models', icon: HardDrive, color: 'blue' as const, href: '/admin' },
    { label: 'View Runtime', icon: Activity, color: 'cyan' as const, href: '/admin' },
    { label: 'System Logs', icon: ScrollText, color: 'green' as const, href: '/admin' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error && !overview && !runtime) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <XCircle className="w-10 h-10 text-[hsl(var(--destructive))]" />
        <p className="text-sm text-muted-foreground">{error}</p>
        <button onClick={() => { setLoading(true); load(); }} className="text-xs text-[hsl(var(--neon-purple))] hover:underline flex items-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Retry
        </button>
      </div>
    );
  }

  // Use overview as primary source (has all metrics from a single API call),
  // fall back to runtime status for any fields overview lacks.
  const gpu = overview?.gpu_utilization ?? runtime?.gpu_utilization ?? 0;
  const vram = overview?.vram_used_mb ?? runtime?.vram_used_mb ?? 0;
  const vramTotal = overview?.vram_total_mb ?? runtime?.vram_total_mb ?? 1;
  const cpu = overview?.cpu_usage ?? runtime?.cpu_usage ?? 0;
  const ram = overview?.ram_usage ?? runtime?.ram_usage ?? 0;
  const temp = (overview as any)?.gpu_temp ?? runtime?.gpu_temp ?? 0;
  const storage = overview?.storage_used_gb ?? runtime?.storage_used_gb ?? 0;
  const storageTotal = overview?.storage_total_gb ?? runtime?.storage_total_gb ?? 1;

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-[1600px] mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative overflow-hidden rounded-3xl glass-card p-6 lg:p-8"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--neon-purple)/0.08)] via-transparent to-[hsl(var(--neon-blue)/0.08)]" />
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-[hsl(var(--neon-purple)/0.1)] blur-[80px]" />
        <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="neon">
                <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--neon-purple))] animate-pulse" />
                System Online
              </Badge>
              <span className="text-xs text-muted-foreground">Uptime: {overview?.uptime ?? '—'}</span>
            </div>
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight mb-1">
              Welcome back to <span className="text-gradient">AI 3D Studio</span>
            </h1>
            <p className="text-sm text-muted-foreground">
              Your AI generation engine is running. {overview?.active_jobs ?? 0} active jobs, {overview?.queued_jobs ?? 0} in queue.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Today</p>
              <p className="text-2xl font-bold font-mono">{overview?.completed_today ?? 0}</p>
              <p className="text-xs text-[hsl(var(--neon-green))]">models generated</p>
            </div>
            <div className="w-px h-12 bg-border" />
            <div className="text-right">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Success Rate</p>
              <p className="text-2xl font-bold font-mono text-[hsl(var(--neon-green))]">{overview?.success_rate != null ? `${overview.success_rate}%` : '—'}</p>
              <p className="text-xs text-muted-foreground">last 24h</p>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {quickActions.map((action, i) => {
          const Icon = action.icon;
          const colorMap = {
            purple: 'from-[hsl(var(--neon-purple)/0.15)] to-[hsl(var(--neon-purple)/0.05)] border-[hsl(var(--neon-purple)/0.2)] text-[hsl(var(--neon-purple))]',
            blue: 'from-[hsl(var(--neon-blue)/0.15)] to-[hsl(var(--neon-blue)/0.05)] border-[hsl(var(--neon-blue)/0.2)] text-[hsl(var(--neon-blue))]',
            cyan: 'from-[hsl(var(--neon-cyan)/0.15)] to-[hsl(var(--neon-cyan)/0.05)] border-[hsl(var(--neon-cyan)/0.2)] text-[hsl(var(--neon-cyan))]',
            green: 'from-emerald-500/15 to-emerald-500/5 border-[hsl(var(--neon-green)/0.2)] text-[hsl(var(--neon-green))]',
          };
          return (
            <motion.a
              key={action.label}
              href={action.href}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.05 }}
              whileHover={{ scale: 1.02, y: -2 }}
              className={`relative flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-br ${colorMap[action.color]} border cursor-pointer transition-all`}
            >
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[hsl(var(--surface-2))]">
                <Icon className="w-5 h-5" />
              </div>
              <span className="text-sm font-medium text-foreground">{action.label}</span>
            </motion.a>
          );
        })}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <MetricCard label="GPU Usage" value={Math.round(gpu)} unit="%" icon={Cpu} color="purple" delay={0.1}>
          <div className="mt-3"><ProgressBar value={gpu} color="purple" size="sm" showGlow /></div>
        </MetricCard>
        <MetricCard label="VRAM" value={`${(vram / 1024).toFixed(1)}`} unit={`/ ${(vramTotal / 1024).toFixed(0)} GB`} icon={Zap} color="blue" delay={0.15}>
          <div className="mt-3"><ProgressBar value={(vram / vramTotal) * 100} color="blue" size="sm" /></div>
        </MetricCard>
        <MetricCard label="CPU" value={Math.round(cpu)} unit="%" icon={Server} color="cyan" delay={0.2}>
          <div className="mt-3"><ProgressBar value={cpu} color="cyan" size="sm" /></div>
        </MetricCard>
        <MetricCard label="RAM" value={Math.round(ram)} unit="%" icon={MemoryStick} color="green" delay={0.25}>
          <div className="mt-3"><ProgressBar value={ram} color="green" size="sm" /></div>
        </MetricCard>
      </div>

      {/* Real-time Recharts Line Chart for VRAM and GPU Utilization */}
      <GlassCard className="p-5 lg:p-6" delay={0.3}>
        <GpuVramLineChart height={280} autoPoll pollIntervalMs={3000} />
      </GlassCard>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <GlassCard className="p-5" delay={0.4}>
          <div className="flex items-center gap-2 mb-3">
            <HardDrive className="w-4 h-4 text-[hsl(var(--neon-cyan))]" />
            <h3 className="text-sm font-semibold">Storage</h3>
          </div>
          <div className="flex items-baseline gap-1 mb-2">
            <span className="text-xl font-bold font-mono">{storage.toFixed(0)}</span>
            <span className="text-sm text-muted-foreground">/ {storageTotal.toFixed(0)} GB</span>
          </div>
          <ProgressBar value={(storage / storageTotal) * 100} color="cyan" size="sm" showGlow />
          <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
            <span>{((storage / storageTotal) * 100).toFixed(0)}% used</span>
            <span>{(storageTotal - storage).toFixed(0)} GB free</span>
          </div>
        </GlassCard>

        <GlassCard className="p-5" delay={0.45}>
          <div className="flex items-center gap-2 mb-3">
            <Thermometer className="w-4 h-4 text-[hsl(var(--neon-amber))]" />
            <h3 className="text-sm font-semibold">Temperature</h3>
          </div>
          <div className="flex items-baseline gap-1 mb-2">
            <span className="text-xl font-bold font-mono">{Math.round(temp)}</span>
            <span className="text-sm text-muted-foreground">°C</span>
          </div>
          <ProgressBar value={temp} color="amber" size="sm" />
          <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
            <span>Normal range</span>
            <span className={temp > 80 ? 'text-[hsl(var(--destructive))]' : 'text-[hsl(var(--neon-green))]'}>
              {temp > 80 ? 'High' : 'Optimal'}
            </span>
          </div>
        </GlassCard>

        <GlassCard className="p-5" delay={0.5}>
          <div className="flex items-center gap-2 mb-3">
            <Gauge className="w-4 h-4 text-[hsl(var(--neon-purple))]" />
            <h3 className="text-sm font-semibold">System Status</h3>
          </div>
          <div className="space-y-2">
            {[
              { label: 'CUDA', status: (overview as any)?.cuda_available ?? runtime?.cuda_available ? 'online' as const : 'offline' as const },
              { label: 'Backend API', status: overview ? 'online' as const : 'offline' as const },
              { label: 'Worker Queue', status: overview?.queue_running ? 'online' as const : 'offline' as const },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{item.label}</span>
                <div className="flex items-center gap-2">
                  <StatusDot status={item.status} size="sm" />
                  <span className="text-xs text-[hsl(var(--neon-green))]">{item.status === 'online' ? 'Operational' : 'Offline'}</span>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
