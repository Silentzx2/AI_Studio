"use client";


import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Container, Play, Square, RotateCw, FileText, Server, RefreshCw, AlertCircle } from 'lucide-react';
import { GlassCard } from '@/components/premium/GlassCard';
import { Badge } from '@/components/premium/Badge';
import { StatusDot } from '@/components/premium/StatusDot';
import { Spinner } from '@/components/premium/Spinner';
import { adminService } from '@/services/adminService';
import type { DockerService } from '@/types';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export function DockerTab() {
  const [services, setServices] = useState<DockerService[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminService.dockerStatus();
      setServices(data);
      setError(data.length === 0 ? 'No Docker services found. Is Docker running?' : null);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAction = async (service: string, action: 'restart' | 'stop' | 'start') => {
    try {
      await adminService.dockerAction(service, action);
      toast.success(`${service}: ${action} completed`);
      load();
    } catch {
      toast.error(`Failed to ${action} ${service}`);
    }
  };

  const handleViewLogs = async (service: string) => {
    setSelected(service);
    setLogsLoading(true);
    const data = await adminService.dockerLogs(service);
    setLogs(data);
    setLogsLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error && services.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertCircle className="w-10 h-10 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">{error}</p>
        <button onClick={load} className="text-xs text-[hsl(var(--neon-purple))] hover:underline flex items-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Docker Services</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {services.filter(s => s.status === 'running').length} running · {services.length} total
          </p>
        </div>
        <button onClick={load} className="p-2 rounded-xl glass border border-[hsl(var(--border)/0.5)] text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground px-1">Containers</h3>
          {services.map((svc, i) => (
            <motion.div key={svc.name} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <GlassCard hover className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'flex items-center justify-center w-9 h-9 rounded-xl',
                      svc.status === 'running' ? 'bg-emerald-500/10' : 'bg-red-500/10'
                    )}>
                      <Container className={cn('w-4 h-4', svc.status === 'running' ? 'text-emerald-400' : 'text-red-400')} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{svc.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{svc.image}</p>
                    </div>
                  </div>
                  <Badge variant={svc.status === 'running' ? 'success' : 'error'}>
                    <StatusDot status={svc.status === 'running' ? 'online' : 'offline'} size="sm" pulse={false} />
                    {svc.status}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{svc.state}</span>
                    {svc.ports.length > 0 && <span className="font-mono">{svc.ports.join(', ')}</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    {svc.status === 'running' ? (
                      <>
                        <button onClick={() => handleAction(svc.name, 'restart')} className="p-1.5 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground" title="Restart">
                          <RotateCw className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleAction(svc.name, 'stop')} className="p-1.5 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-red-400" title="Stop">
                          <Square className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <button onClick={() => handleAction(svc.name, 'start')} className="p-1.5 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-emerald-400" title="Start">
                        <Play className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button onClick={() => handleViewLogs(svc.name)} className={cn('p-1.5 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground', selected === svc.name && 'bg-white/5 text-foreground')} title="Logs">
                      <FileText className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          ))}
        </div>

        <div>
          <h3 className="text-sm font-semibold text-foreground px-1 mb-3">Container Logs</h3>
          <GlassCard className="p-0 overflow-hidden" delay={0.1}>
            <div className="p-3 border-b border-[hsl(var(--border)/0.3)] flex items-center gap-2">
              <Server className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-mono text-foreground">{selected || 'Select a container'}</span>
            </div>
            <div className="max-h-[500px] overflow-y-auto scrollbar-thin font-mono p-4">
              {logsLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Spinner size="md" />
                </div>
              ) : selected ? (
                logs.length > 0 ? (
                  logs.map((line, i) => (
                    <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }} className="text-xs text-muted-foreground py-0.5">
                      {line}
                    </motion.div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center py-20">
                    <FileText className="w-8 h-8 text-muted-foreground/30 mb-2" />
                    <p className="text-sm text-muted-foreground">No logs available</p>
                  </div>
                )
              ) : (
                <div className="flex flex-col items-center justify-center py-20">
                  <FileText className="w-8 h-8 text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">Select a container to view logs</p>
                </div>
              )}
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
