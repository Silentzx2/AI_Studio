"use client";


import { useEffect, useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ScrollText, Search, Trash2, Info, AlertTriangle, XCircle, CheckCircle, Bug, RefreshCw, Copy } from 'lucide-react';
import { GlassCard } from '@/components/premium/GlassCard';
import { NeonButton } from '@/components/premium/NeonButton';
import { Spinner } from '@/components/premium/Spinner';
import { adminService } from '@/services/adminService';
import type { AdminLog } from '@/types';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const LOG_ICONS = {
  info: Info,
  warn: AlertTriangle,
  error: XCircle,
  debug: Bug,
  success: CheckCircle,
};

const LOG_COLORS = {
  info: 'text-[hsl(var(--neon-blue))]',
  warn: 'text-[hsl(var(--neon-amber))]',
  error: 'text-[hsl(var(--destructive))]',
  debug: 'text-[hsl(var(--neon-purple))]',
  success: 'text-[hsl(var(--neon-green))]',
};

export function LogsTab() {
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const data = await adminService.getLogs(100, levelFilter !== 'all' ? levelFilter : undefined);
    if (data.length > 0) {
      setLogs(data);
    } else {
      setLogs([]);
    }
    setError(null);
    setLoading(false);
  }, [levelFilter]);

  useEffect(() => {
    setTimeout(() => load(), 0);
  }, [load]);

  useEffect(() => {
    const stopStream = adminService.streamAdminLogs((entry) => {
      setLogs((prev) => [...prev.slice(-200), entry]);
    }, 50);
    return () => stopStream();
  }, []);

  useEffect(() => {
    if (autoScroll) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const filtered = logs.filter((log) => {
    const matchesSearch = log.message.toLowerCase().includes(search.toLowerCase()) || log.source.toLowerCase().includes(search.toLowerCase());
    const matchesLevel = levelFilter === 'all' || log.level === levelFilter;
    return matchesSearch && matchesLevel;
  });

  const handleClear = async () => {
    try {
      await adminService.clearLogs();
      setLogs([]);
      toast.success('Logs cleared');
    } catch {
      toast.error('Failed to clear logs');
    }
  };

  const handleCopy = async () => {
    try {
      const textToCopy = filtered.map(log => `[${new Date(log.timestamp).toLocaleTimeString()}] [${log.level.toUpperCase()}] [${log.source}] ${log.message}`).join('\n');
      await navigator.clipboard.writeText(textToCopy);
      toast.success('Logs copied to clipboard');
    } catch {
      toast.error('Failed to copy logs');
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-[1600px] mx-auto">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">System Logs</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {filtered.length} entries · {error ? 'Offline mode' : 'Live streaming'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={cn(
              'px-3 py-1.5 rounded-xl text-xs font-medium border transition-all',
              autoScroll
                ? 'bg-[hsl(var(--neon-purple)/0.15)] text-foreground border-[hsl(var(--neon-purple)/0.3)]'
                : 'glass text-muted-foreground border-[hsl(var(--border)/0.5)]'
            )}
          >
            Auto-scroll: {autoScroll ? 'On' : 'Off'}
          </button>
          <NeonButton variant="secondary" size="sm" onClick={handleCopy} disabled={filtered.length === 0}>
            <Copy className="w-3.5 h-3.5" /> Copy
          </NeonButton>
          <NeonButton variant="secondary" size="sm" onClick={load}>
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </NeonButton>
          <NeonButton variant="destructive" size="sm" onClick={handleClear}>
            <Trash2 className="w-3.5 h-3.5" /> Clear
          </NeonButton>
        </div>
      </div>

      <GlassCard className="p-4" delay={0.05}>
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search logs..."
              className="w-full h-9 pl-9 pr-4 rounded-xl glass text-sm border border-[hsl(var(--border)/0.5)] focus:border-[hsl(var(--neon-purple)/0.4)] focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            {['all', 'info', 'warn', 'error', 'debug'].map((level) => (
              <button
                key={level}
                onClick={() => setLevelFilter(level)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all border',
                  levelFilter === level
                    ? 'bg-[hsl(var(--neon-purple)/0.15)] text-foreground border-[hsl(var(--neon-purple)/0.3)]'
                    : 'glass text-muted-foreground border-[hsl(var(--border)/0.5)] hover:text-foreground'
                )}
              >
                {level}
              </button>
            ))}
          </div>
        </div>
      </GlassCard>

      <GlassCard className="p-0 overflow-hidden" delay={0.1}>
        <div className="max-h-[600px] overflow-y-auto scrollbar-thin font-mono">
          {loading && logs.length === 0 ? (
            <div className="flex items-center justify-center py-20">
              <Spinner size="md" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <ScrollText className="w-10 h-10 text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">No logs found</p>
            </div>
          ) : (
            filtered.map((log, i) => {
              const Icon = LOG_ICONS[log.level as keyof typeof LOG_ICONS] || Info;
              return (
                <motion.div
                  key={log.id || i}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i * 0.005, 0.2) }}
                  className="flex items-start gap-3 px-4 py-2.5 border-b border-[hsl(var(--border)/0.3)] hover:bg-white/[0.02] transition-colors"
                >
                  <Icon className={cn('w-3.5 h-3.5 mt-0.5 shrink-0', LOG_COLORS[log.level as keyof typeof LOG_COLORS])} />
                  <span className="text-xs text-muted-foreground/50 shrink-0">{new Date(log.timestamp).toLocaleTimeString()}</span>
                  <span className={cn('text-xs font-bold shrink-0 uppercase', LOG_COLORS[log.level as keyof typeof LOG_COLORS])}>
                    {log.level}
                  </span>
                  <span className="text-xs text-muted-foreground/60 shrink-0">[{log.source}]</span>
                  <span className="text-xs text-foreground flex-1">{log.message}</span>
                </motion.div>
              );
            })
          )}
          <div ref={logsEndRef} />
        </div>
      </GlassCard>
    </div>
  );
}
