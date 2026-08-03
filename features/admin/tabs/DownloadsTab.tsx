"use client";


import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Download, Pause, Play, RotateCw, X, CheckCircle, AlertCircle,
  Loader2, Clock, Zap, HardDrive, RefreshCw
} from 'lucide-react';
import { GlassCard } from '@/components/premium/GlassCard';
import { ProgressBar } from '@/components/premium/ProgressBar';
import { Badge } from '@/components/premium/Badge';
import { Spinner } from '@/components/premium/Spinner';
import { adminService } from '@/services/adminService';
import type { AdminModel, InstallProgress } from '@/types';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface DownloadItem {
  id: string;
  name: string;
  type: string;
  size: number;
  downloaded: number;
  speed: number;
  status: 'downloading' | 'paused' | 'completed' | 'error' | 'queued';
  eta: number;
  priority: 'high' | 'normal' | 'low';
}

export function DownloadsTab() {
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [models, setModels] = useState<AdminModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [progressMap, setProgressMap] = useState<Record<string, InstallProgress>>({});

  const load = useCallback(async () => {
    const data = await adminService.listModels();
    setModels(data);
    const items: DownloadItem[] = data
      .filter((m) => m.status === 'downloading' || m.status === 'not-installed')
      .map((m) => ({
        id: m.id,
        name: m.name,
        type: m.type,
        size: m.size_mb,
        downloaded: 0,
        speed: 0,
        status: m.status === 'downloading' ? 'downloading' as const : 'queued' as const,
        eta: 0,
        priority: 'normal' as const,
      }));
    setDownloads(items);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const downloadingIds = downloads.filter((d) => d.status === 'downloading').map((d) => d.id).join(',');

  useEffect(() => {
    const downloading = downloads.filter((d) => d.status === 'downloading');
    const stopStreams = downloading.map((d) =>
      adminService.streamInstallProgress(d.id, (progress) => {
        setProgressMap((prev) => ({ ...prev, [d.id]: progress }));
        setDownloads((prev) => prev.map((item) =>
          item.id === d.id
            ? {
                ...item,
                downloaded: progress.downloaded_mb ?? item.downloaded,
                speed: progress.speed_mbps ?? item.speed,
                eta: progress.eta_seconds ?? item.eta,
                status: progress.status === 'completed' ? 'completed' as const
                  : progress.status === 'error' || progress.status === 'failed' ? 'error' as const
                  : item.status,
              }
            : item
        ));

        // Refresh model lists across the app when a download completes
        if (progress.status === 'completed') {
          adminService.listModels().then(setModels);
        }
      })
    );
    return () => stopStreams.forEach((stop) => stop());
  }, [downloadingIds]);

  const activeCount = downloads.filter((d) => d.status === 'downloading').length;
  const completedCount = downloads.filter((d) => d.status === 'completed').length;
  const totalSpeed = downloads.filter((d) => d.status === 'downloading').reduce((sum, d) => sum + d.speed, 0);

  const togglePause = (id: string) => {
    setDownloads((prev) => prev.map((d) =>
      d.id === id ? { ...d, status: d.status === 'downloading' ? 'paused' as const : 'downloading' as const } : d
    ));
  };

  const retry = async (id: string) => {
    try {
      await adminService.modelAction(id, 'install');
      setDownloads((prev) => prev.map((d) =>
        d.id === id ? { ...d, status: 'downloading' as const, speed: 0, downloaded: 0, eta: 0 } : d
      ));
    } catch {
      toast.error('Failed to retry download');
    }
  };

  const cancel = (id: string) => {
    setDownloads((prev) => prev.filter((d) => d.id !== id));
  };

  const selectedItem = downloads.find((d) => d.id === selected);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Download Manager</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {activeCount} active · {completedCount} completed · {totalSpeed.toFixed(1)} MB/s total
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 rounded-xl glass border border-[hsl(var(--border)/0.5)] text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
          <Badge variant="info">
            <Download className="w-3 h-3" />
            {downloads.length} items
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Active', value: activeCount, icon: Loader2, color: 'purple' as const },
          { label: 'Completed', value: completedCount, icon: CheckCircle, color: 'green' as const },
          { label: 'Total Speed', value: `${totalSpeed.toFixed(0)}`, unit: 'MB/s', icon: Zap, color: 'blue' as const },
          { label: 'Queue', value: downloads.filter((d) => d.status === 'queued').length, icon: Clock, color: 'cyan' as const },
        ].map((stat, i) => {
          const Icon = stat.icon;
          const colorMap = {
            purple: 'text-[hsl(var(--neon-purple))] bg-[hsl(var(--neon-purple)/0.1)]',
            green: 'text-emerald-400 bg-emerald-500/10',
            blue: 'text-[hsl(var(--neon-blue))] bg-[hsl(var(--neon-blue)/0.1)]',
            cyan: 'text-[hsl(var(--neon-cyan))] bg-[hsl(var(--neon-cyan)/0.1)]',
          };
          return (
            <GlassCard key={stat.label} delay={i * 0.05} className="p-4">
              <div className="flex items-center gap-3">
                <div className={cn('flex items-center justify-center w-9 h-9 rounded-xl', colorMap[stat.color])}>
                  <Icon className={cn('w-4 h-4', stat.label === 'Active' && 'animate-spin')} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">{stat.label}</p>
                  <p className="text-lg font-bold font-mono">{stat.value}{stat.unit && <span className="text-sm text-muted-foreground ml-1">{stat.unit}</span>}</p>
                </div>
              </div>
            </GlassCard>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-3">
          <h3 className="text-sm font-semibold text-foreground px-1">Download Queue</h3>
          <AnimatePresence>
            {downloads.map((item, i) => (
              <motion.div key={item.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ delay: i * 0.05 }}>
                <GlassCard hover className={cn('p-4 cursor-pointer', selected === item.id && 'border-[hsl(var(--neon-purple)/0.3)]')}>
                  <div onClick={() => setSelected(item.id)}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className={cn('flex items-center justify-center w-9 h-9 rounded-xl', item.status === 'completed' ? 'bg-emerald-500/10' : 'bg-surface-2')}>
                          {item.status === 'completed' ? <CheckCircle className="w-4 h-4 text-emerald-400" /> :
                           item.status === 'downloading' ? <Loader2 className="w-4 h-4 text-[hsl(var(--neon-purple))] animate-spin" /> :
                           item.status === 'paused' ? <Pause className="w-4 h-4 text-amber-400" /> :
                           item.status === 'queued' ? <Clock className="w-4 h-4 text-muted-foreground" /> :
                           <AlertCircle className="w-4 h-4 text-red-400" />}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{item.name}</p>
                          <p className="text-xs text-muted-foreground">{item.type}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {item.priority === 'high' && <Badge variant="error">High</Badge>}
                        <span className="text-xs font-mono text-muted-foreground">
                          {(item.downloaded / 1024).toFixed(1)} / {(item.size / 1024).toFixed(1)} GB
                        </span>
                      </div>
                    </div>
                    <ProgressBar value={item.size > 0 ? (item.downloaded / item.size) * 100 : 0} color={item.status === 'completed' ? 'green' : 'purple'} size="sm" showGlow={item.status === 'downloading'} />
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                        {item.status === 'downloading' && (<><span>{item.speed.toFixed(1)} MB/s</span><span>ETA: {item.eta}s</span></>)}
                        {item.status === 'completed' && <span className="text-emerald-400">Completed</span>}
                        {item.status === 'paused' && <span className="text-amber-400">Paused</span>}
                        {item.status === 'queued' && <span>Waiting...</span>}
                        {item.status === 'error' && <span className="text-red-400">Error</span>}
                      </div>
                      <div className="flex items-center gap-1">
                        {item.status === 'downloading' && (
                          <button onClick={(e) => { e.stopPropagation(); togglePause(item.id); }} className="p-1.5 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground">
                            <Pause className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {item.status === 'paused' && (
                          <button onClick={(e) => { e.stopPropagation(); togglePause(item.id); }} className="p-1.5 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground">
                            <Play className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {(item.status === 'error' || item.status === 'paused') && (
                          <button onClick={(e) => { e.stopPropagation(); retry(item.id); }} className="p-1.5 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground">
                            <RotateCw className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {item.status !== 'completed' && (
                          <button onClick={(e) => { e.stopPropagation(); cancel(item.id); }} className="p-1.5 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-red-400">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            ))}
          </AnimatePresence>
          {downloads.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Download className="w-12 h-12 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No downloads in queue</p>
              <p className="text-xs text-muted-foreground/50 mt-1">Install models from the Models tab to start downloading</p>
            </div>
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold text-foreground px-1 mb-3">Details</h3>
          {selectedItem ? (
            <GlassCard className="p-5" delay={0.1}>
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Name</p>
                  <p className="text-sm font-medium text-foreground">{selectedItem.name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Type</p>
                  <p className="text-sm text-foreground">{selectedItem.type}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Size</p>
                    <p className="text-sm font-mono text-foreground">{(selectedItem.size / 1024).toFixed(1)} GB</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Downloaded</p>
                    <p className="text-sm font-mono text-foreground">{(selectedItem.downloaded / 1024).toFixed(1)} GB</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Speed</p>
                    <p className="text-sm font-mono text-foreground">{selectedItem.speed.toFixed(1)} MB/s</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">ETA</p>
                    <p className="text-sm font-mono text-foreground">{selectedItem.eta > 0 ? `${selectedItem.eta}s` : '—'}</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Status</p>
                  <Badge variant={selectedItem.status === 'completed' ? 'success' : selectedItem.status === 'downloading' ? 'neon' : 'warning'}>
                    {selectedItem.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Progress</p>
                  <ProgressBar value={selectedItem.size > 0 ? (selectedItem.downloaded / selectedItem.size) * 100 : 0} color="purple" size="md" showGlow />
                  <p className="text-xs text-muted-foreground mt-1 text-right">{selectedItem.size > 0 ? ((selectedItem.downloaded / selectedItem.size) * 100).toFixed(0) : 0}%</p>
                </div>
              </div>
            </GlassCard>
          ) : (
            <GlassCard className="p-8 text-center" delay={0.1}>
              <Download className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Select a download to view details</p>
            </GlassCard>
          )}
        </div>
      </div>
    </div>
  );
}
