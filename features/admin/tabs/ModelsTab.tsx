"use client";


import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Download, CheckCircle, Loader2,
  HardDrive, Boxes, X, Tag, RefreshCw, AlertCircle,
  Trash2, ChevronDown, Zap, Clock,
  Play, Pause, Unplug,
} from 'lucide-react';
import { GlassCard } from '@/components/premium/GlassCard';
import { ProgressBar } from '@/components/premium/ProgressBar';
import { Badge } from '@/components/premium/Badge';
import { Switch } from '@/components/ui/switch';
import { adminService } from '@/services/adminService';
import { useTaskManager } from '@/hooks/useTaskManager';
import { useUIStore } from '@/stores/useUIStore';
import type { AdminModel, InstallProgress } from '@/types';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ─── Phase labels for install progress ───────────────────────────────────────
const PHASE_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  repo:     { label: 'Cloning repository',     icon: <Boxes size={13} />,          color: 'text-[hsl(var(--muted-foreground))]' },
  venv:     { label: 'Creating virtualenv',    icon: <Zap size={13} />,            color: 'text-[hsl(var(--muted-foreground))]' },
  deps:     { label: 'Installing dependencies', icon: <Download size={13} />,       color: 'text-[hsl(var(--muted-foreground))]' },
  weights:  { label: 'Downloading weights',    icon: <HardDrive size={13} />,      color: 'text-[hsl(var(--muted-foreground))]' },
  extract:  { label: 'Extracting files',       icon: <Loader2 size={13} />,        color: 'text-[hsl(var(--muted-foreground))]' },
  verify:   { label: 'Verifying install',      icon: <CheckCircle size={13} />,    color: 'text-[hsl(var(--muted-foreground))]' },
  complete: { label: 'Installation complete',  icon: <CheckCircle size={13} />,    color: 'text-[hsl(var(--muted-foreground))]' },
};

function fmtBytes(n: number): string {
  if (n <= 0) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1_048_576) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1_073_741_824) return `${(n / 1_048_576).toFixed(1)} MB`;
  return `${(n / 1_073_741_824).toFixed(2)} GB`;
}

function fmtSpeed(bps: number): string {
  if (bps <= 0) return '—';
  if (bps < 1024) return `${bps.toFixed(0)} B/s`;
  if (bps < 1_048_576) return `${(bps / 1024).toFixed(1)} KB/s`;
  return `${(bps / 1_048_576).toFixed(1)} MB/s`;
}

function fmtETA(secs: number | null | undefined): string {
  if (secs == null || secs < 0) return '—';
  if (secs < 60) return `${secs.toFixed(0)}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m < 60) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

// ─── Loading Skeleton ────────────────────────────────────────────────────────
function ModelCardSkeleton() {
  return (
    <GlassCard className="p-5 h-full flex flex-col gap-4 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-[hsl(var(--surface-2))]" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-3/4 rounded bg-[hsl(var(--surface-2))]" />
          <div className="h-3 w-1/2 rounded bg-[hsl(var(--surface-2))]" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-3 w-full rounded bg-[hsl(var(--surface-2))]" />
        <div className="h-3 w-2/3 rounded bg-[hsl(var(--surface-2))]" />
      </div>
      <div className="mt-auto h-9 rounded-xl bg-[hsl(var(--surface-2))]" />
    </GlassCard>
  );
}

// ─── Install Progress Inline Component ───────────────────────────────────────
function InstallProgressInline({
  progress,
  onCancel,
}: {
  progress: InstallProgress;
  onCancel?: () => void;
}) {
  const isDone = progress.status === 'completed';
  const isFailed = progress.status === 'failed';
  const pct = Math.min(100, Math.max(0, progress.percent ?? 0));
  const phase = PHASE_META[progress.phase ?? ''] ?? PHASE_META['weights'];
  const speedBps = progress.speed_bps ?? 0;
  const totalMb = (progress.total_mb ?? 0);
  const downloadedMb = (progress.downloaded_mb ?? 0);
  const bytesTotal = progress.bytes_total ?? 0;
  const bytesDownloaded = progress.bytes_downloaded ?? 0;

  return (
    <div className="mt-3 space-y-2.5 p-3 rounded-xl card-minimal">
      {/* Phase + percent */}
      <div className="flex items-center justify-between">
        <div className={cn('flex items-center gap-1.5 text-xs font-medium', phase.color)}>
          {isDone ? <CheckCircle size={12} className="text-[hsl(var(--muted-foreground))]" /> :
           isFailed ? <AlertCircle size={12} className="text-[hsl(var(--destructive))]" /> :
           phase.icon}
          <span>{isDone ? 'Installation complete' : isFailed ? 'Installation failed' : phase.label}</span>
        </div>
        <span className={cn(
          'text-sm font-bold font-mono',
          isDone ? 'text-[hsl(var(--muted-foreground))]' : isFailed ? 'text-[hsl(var(--destructive))]' : 'text-[hsl(var(--primary))]'
        )}>
          {pct.toFixed(1)}%
        </span>
      </div>

      {/* Progress bar */}
      <ProgressBar value={pct} color="purple" size="md" />

      {/* Stats row */}
      {!isDone && !isFailed && (
        <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
          <span className="flex items-center gap-1">
            <HardDrive size={10} />
            {bytesTotal > 0
              ? `${fmtBytes(bytesDownloaded)} / ${fmtBytes(bytesTotal)}`
              : fmtBytes(bytesDownloaded)}
          </span>
          <div className="flex items-center gap-3">
            {speedBps > 0 && (
              <span className="flex items-center gap-1 text-[hsl(var(--muted-foreground))]">
                <Zap size={10} />
                {fmtSpeed(speedBps)}
              </span>
            )}
            {progress.eta_seconds != null && progress.eta_seconds > 0 && (
              <span className="flex items-center gap-1">
                <Clock size={10} />
                {fmtETA(progress.eta_seconds)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Log line */}
      {progress.log && !isDone && !isFailed && (
        <p className="text-[10px] font-mono truncate text-muted-foreground/60" title={progress.log}>
          {progress.log}
        </p>
      )}

      {/* Error */}
      {isFailed && progress.error && (
        <div className="flex items-start gap-2 text-xs text-[hsl(var(--destructive))] bg-[hsl(var(--destructive)/0.08)] p-2 rounded-lg">
          <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
          <span className="break-all">{progress.error}</span>
        </div>
      )}

      {/* Cancel */}
      {!isDone && !isFailed && onCancel && (
        <div className="flex justify-end">
          <button
            onClick={onCancel}
            className="text-[10px] text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1"
          >
            <X size={10} /> Cancel
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main Models Tab ─────────────────────────────────────────────────────────
export function ModelsTab() {
  const [models, setModels] = useState<AdminModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [installProgress, setInstallProgress] = useState<Record<string, InstallProgress>>({});
  const [categories, setCategories] = useState<string[]>(['All']);
  const { reconnectToInstall } = useTaskManager();
  const streamCleanups = useRef<Record<string, () => void>>({});
  const pollCleanup = useRef<ReturnType<typeof setInterval> | null>(null);
  const { capabilities, setCapability } = useUIStore();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminService.listModels();
      if (data.length > 0) {
        setModels(data);
        const cats = Array.from(new Set(data.map((m) => m.type).filter(Boolean)));
        setCategories(['All', ...cats]);
      } else {
        setError('No models found. Install models from the runtime options.');
      }
    } catch {
      // ignore
    }
    setLoading(false);
  }, []);

  useEffect(() => { setTimeout(() => load(), 0); }, [load]);

  // Poll install status for native-build updates
  useEffect(() => {
    if (models.length === 0) return;
    pollCleanup.current = setInterval(async () => {
      try {
        const status = await adminService.getInstallStatus();
        if (!status) return;
        setModels(prev => prev.map(m => {
          const entry = status[m.id];
          if (!entry || !entry.components?.native_build) return m;
          return { ...m, native_build: entry.components.native_build };
        }));
      } catch {
        // ignore poll errors
      }
    }, 5000);
    return () => {
      if (pollCleanup.current) clearInterval(pollCleanup.current);
    };
  }, [models.length]);

  // Cleanup SSE streams on unmount
  useEffect(() => {
    return () => {
      Object.values(streamCleanups.current).forEach((cleanup) => {
        try { cleanup(); } catch { /* ignore */ }
      });
      streamCleanups.current = {};
    };
  }, []);

  // Restore install state from persisted progress on mount
  useEffect(() => {
    const restoreProgress = async () => {
      for (const model of models) {
        if (!installProgress[model.id]) {
          try {
            const snap = await adminService.getInstallProgress(model.id);
            if (snap && snap.status && snap.status !== 'idle' && snap.status !== 'completed') {
              setInstallProgress((prev) => ({ ...prev, [model.id]: snap }));
              // Reconnect SSE to resume streaming
              reconnectToInstall(model.id, snap);
            }
          } catch {
            // ignore
          }
        }
      }
    };
    if (models.length > 0) {
      restoreProgress();
    }
  }, [models.length]);

  const filtered = models.filter((m) => {
    const matchesSearch = m.name.toLowerCase().includes(search.toLowerCase()) ||
                          m.id.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = category === 'All' || m.type === category;
    return matchesSearch && matchesCategory;
  });

  const installedCount = models.filter((m) => m.installed).length;
  const totalSizeGB = models.filter((m) => m.installed).reduce((sum, m) => sum + (m.size_mb || 0), 0) / 1024;

  const handleInstall = async (model: AdminModel) => {
    // Cancel any existing stream for this model
    if (streamCleanups.current[model.id]) {
      streamCleanups.current[model.id]();
    }

    setInstallProgress((prev) => ({
      ...prev,
      [model.id]: {
        model_id: model.id,
        phase: 'repo',
        progress: 0,
        percent: 0,
        speed_mbps: 0,
        downloaded_mb: 0,
        total_mb: model.size_mb,
        eta_seconds: 0,
        status: 'starting',
      },
    }));

    let stopStream: (() => void) | null = null;

    try {
      await adminService.modelAction(model.id, 'install');

      await new Promise((resolve) => setTimeout(resolve, 300));

      stopStream = adminService.streamInstallProgress(
        model.id,
        (progress) => {
          setInstallProgress((prev) => ({ ...prev, [model.id]: progress }));
        },
        () => {
          setInstallProgress((prev) => {
            const n = { ...prev };
            delete n[model.id];
            return n;
          });
          setModels((prev) => prev.map((m) => m.id === model.id ? { ...m, installed: true, status: 'installed' } : m));
          toast.success(`${model.name} installed successfully`);
          load();
        },
      );

      streamCleanups.current[model.id] = stopStream;
    } catch (error) {
      toast.error(`Failed to install ${model.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      if (stopStream) stopStream();
      setInstallProgress((prev) => {
        const n = { ...prev };
        delete n[model.id];
        return n;
      });
    }
  };

  const handleCancel = (modelId: string) => {
    adminService.modelAction(modelId, 'cancel').catch(() => {});
    if (streamCleanups.current[modelId]) {
      streamCleanups.current[modelId]();
      delete streamCleanups.current[modelId];
    }
    setInstallProgress((prev) => {
      const n = { ...prev };
      delete n[modelId];
      return n;
    });
  };

  const handleUninstall = async (model: AdminModel) => {
    try {
      await adminService.modelAction(model.id, 'uninstall');
      setModels((prev) => prev.map((m) => m.id === model.id ? { ...m, installed: false, status: 'not-installed' } : m));
      toast.success(`${model.name} uninstalled`);
    } catch {
      toast.error(`Failed to uninstall ${model.name}`);
    }
  };

  if (loading) {
    return (
      <div className="p-4 lg:p-6 space-y-6 max-w-[1600px] mx-auto">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-7 w-48 rounded bg-[hsl(var(--surface-2))] animate-pulse" />
            <div className="h-4 w-72 rounded bg-[hsl(var(--surface-2))] animate-pulse" />
          </div>
          <div className="h-9 w-9 rounded-xl bg-[hsl(var(--surface-2))] animate-pulse" />
        </div>
        <div className="h-10 w-full max-w-md rounded-xl bg-[hsl(var(--surface-2))] animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <ModelCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (error && models.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 py-20">
        <AlertCircle className="w-10 h-10 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">{error}</p>
        <button onClick={load} className="text-xs text-[hsl(var(--muted-foreground))] hover:underline flex items-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Boxes className="w-6 h-6 text-[hsl(var(--muted-foreground))]" />
            AI Models
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {installedCount} installed · {totalSizeGB.toFixed(1)} GB used · {models.length} total
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => load()}
            className="p-2 rounded-xl glass border border-[hsl(var(--border)/0.5)] text-muted-foreground hover:text-[hsl(var(--muted-foreground))] transition-colors"
            title="Refresh models"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search models..."
              className="w-64 h-9 pl-9 pr-4 rounded-xl glass text-sm border border-[hsl(var(--border)/0.5)] focus:border-[hsl(var(--border))] focus:outline-none transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Category filters */}
      {categories.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-thin pb-1">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={cn(
                'px-3.5 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all border',
                category === cat
                  ? 'bg-[hsl(var(--surface-2))] text-[hsl(var(--muted-foreground))] border-[hsl(var(--border)/0.3)]'
                  : 'glass text-muted-foreground border-[hsl(var(--border)/0.5)] hover:text-[hsl(var(--muted-foreground))]'
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Global AI capabilities */}
      <GlassCard className="p-4" hover>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Zap className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
            Global AI Capabilities
          </h2>
          <span className="text-xs text-muted-foreground">Feature toggles used across the workspace</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {([
            { key: 'threeDGen', label: '3D Generation', desc: 'Enable 3D mesh generation capabilities' },
            { key: 'remesh', label: 'Remesh & Refine', desc: 'Enable mesh optimization and remeshing' },
            { key: 'textureGen', label: 'Texture Generation', desc: 'Enable AI texture mapping for 3D objects' },
          ] as const).map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between p-3 rounded-lg border border-[hsl(var(--border)/0.5)] bg-[hsl(var(--surface-0)/0.5)]">
              <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
              <Switch
                checked={capabilities[key]}
                onCheckedChange={(c) => setCapability(key, c)}
              />
            </div>
          ))}
        </div>
      </GlassCard>

      {/* Model grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <AnimatePresence mode="popLayout">
          {filtered.map((model, i) => {
            const progress = installProgress[model.id];
            const isDownloading = !!progress && progress.status !== 'completed' && progress.status !== 'failed';

            return (
              <motion.div
                key={model.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: i * 0.04, type: 'spring', stiffness: 300, damping: 25 }}
              >
                <GlassCard hover className="p-5 h-full flex flex-col">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        'flex items-center justify-center w-11 h-11 rounded-xl border relative',
                        model.installed
                          ? 'bg-[hsl(var(--surface-3))] border-[hsl(var(--border)/0.3)]'
                          : 'bg-[hsl(var(--surface-2))] border-[hsl(var(--border))]'
                      )}>
                        <Boxes className={cn('w-5 h-5', model.installed ? 'text-[hsl(var(--muted-foreground))]' : 'text-muted-foreground')} />
                        {/* Status dot */}
                        <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                          {isDownloading ? (
                            <>
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[hsl(var(--muted-foreground))] opacity-75" />
                              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[hsl(var(--muted-foreground))]" />
                            </>
                          ) : model.installed ? (
                            <>
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[hsl(var(--muted-foreground))] opacity-30" />
                              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[hsl(var(--muted-foreground))]" />
                            </>
                          ) : (
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-muted-foreground/40" />
                          )}
                        </span>
                      </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-[hsl(var(--muted-foreground))] truncate">{model.name}</h3>
                            {model.version && (
                              <span className="text-[10px] text-muted-foreground font-mono">v{model.version}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Badge variant={model.installed ? 'success' : 'default'} size="sm" dot>
                              {model.installed ? 'Installed' : 'Available'}
                            </Badge>
                            {model.native_build && (
                              <span className={cn(
                                'text-[10px] font-medium px-1.5 py-0.5 rounded-md flex items-center gap-1',
                                model.native_build.state === 'not_required' && 'bg-[hsl(var(--muted-foreground)/0.08)] text-[hsl(var(--muted-foreground))]',
                                model.native_build.state === 'pending' && 'bg-[hsl(var(--amber-500)/0.15)] text-[hsl(var(--amber-500))]',
                                model.native_build.state === 'running' && 'bg-[hsl(var(--blue-500)/0.15)] text-[hsl(var(--blue-500))]',
                                model.native_build.state === 'complete' && 'bg-[hsl(var(--green-500)/0.15)] text-[hsl(var(--green-500))]',
                                model.native_build.state === 'failed' && 'bg-[hsl(var(--red-500)/0.15)] text-[hsl(var(--red-500))]',
                              )}>
                                {model.native_build.state === 'not_required' && <span className="text-[9px]">N/A</span>}
                                {model.native_build.state === 'not_required' && 'Not Required'}
                                {model.native_build.state === 'pending' && <Clock size={9} />}
                                {model.native_build.state === 'pending' && 'Pending'}
                                {model.native_build.state === 'running' && <Loader2 size={9} className="animate-spin" />}
                                {model.native_build.state === 'running' && 'Building'}
                                {model.native_build.state === 'complete' && <CheckCircle size={9} />}
                                {model.native_build.state === 'complete' && 'Complete'}
                                {model.native_build.state === 'failed' && <AlertCircle size={9} />}
                                {model.native_build.state === 'failed' && 'Failed'}
                              </span>
                            )}
                            {model.native_build?.state === 'running' && model.native_build.current_step && (
                              <span className="text-[10px] text-muted-foreground truncate max-w-[200px]" title={model.native_build.current_step}>
                                {model.native_build.current_step}
                              </span>
                            )}
                            {model.type && (
                              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <Tag size={9} /> {model.type}
                              </span>
                            )}
                          </div>
                          {model.native_build?.state === 'failed' && model.native_build.detail && (
                            <p className="text-[10px] text-[hsl(var(--destructive))] mt-1 truncate" title={model.native_build.detail}>
                              {model.native_build.detail}
                            </p>
                          )}
                        </div>
                    </div>
                  </div>

                  {/* Meta grid */}
                  <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                    {model.size_mb > 0 && (
                      <div className="flex flex-col gap-0.5 bg-[hsl(var(--surface-2)/0.4)] p-2 rounded-lg border border-[hsl(var(--border)/0.4)]">
                        <span className="text-[10px] text-muted-foreground uppercase">Size</span>
                        <span className="font-bold text-[hsl(var(--muted-foreground))] text-[11px]">{(model.size_mb / 1024).toFixed(1)} GB</span>
                      </div>
                    )}
                    {model.vram_required_mb ? (
                      <div className="flex flex-col gap-0.5 bg-[hsl(var(--surface-2)/0.4)] p-2 rounded-lg border border-[hsl(var(--border)/0.4)]">
                        <span className="text-[10px] text-muted-foreground uppercase">VRAM</span>
                        <span className="font-bold text-[hsl(var(--muted-foreground))] text-[11px]">{(model.vram_required_mb / 1024).toFixed(1)} GB</span>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-0.5 bg-[hsl(var(--surface-2)/0.4)] p-2 rounded-lg border border-[hsl(var(--border)/0.4)]">
                        <span className="text-[10px] text-muted-foreground uppercase">Category</span>
                        <span className="font-bold text-[hsl(var(--muted-foreground))] text-[11px] capitalize">{model.type || 'N/A'}</span>
                      </div>
                    )}
                  </div>

                  {/* Progress section — show for any non-terminal install phase */}
                  {isDownloading && progress && (
                    <InstallProgressInline
                      progress={progress}
                      onCancel={() => handleCancel(model.id)}
                    />
                  )}

                  {/* Actions */}
                  <div className="mt-auto flex items-center gap-2 pt-3 border-t border-[hsl(var(--border))]/[0.04]">
                    {/* isDownloading covers starting / downloading / installing;
                        false when completed or failed → show Install in those cases. */}
                    {!model.installed && isDownloading ? (
                      <button
                        onClick={() => handleCancel(model.id)}
                        className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl bg-[hsl(var(--destructive)/0.08)] border border-[hsl(var(--destructive)/0.15)] text-xs text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive)/0.14)] transition-colors"
                      >
                        <Unplug className="w-3.5 h-3.5" /> Cancel
                      </button>
                    ) : model.installed ? (
                      <>
                        {model.loaded ? (
                          <button
                            onClick={() => adminService.modelAction(model.id, 'unload')}
                            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl glass border border-[hsl(var(--border)/0.5)] text-xs text-muted-foreground hover:text-[hsl(var(--muted-foreground))] transition-colors"
                          >
                            <Pause className="w-3.5 h-3.5" /> Unload
                          </button>
                        ) : (
                          <button
                            onClick={() => adminService.modelAction(model.id, 'load')}
                            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl glass border border-[hsl(var(--border)/0.3)] text-xs text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-3))] transition-colors"
                          >
                            <Play className="w-3.5 h-3.5" /> Load
                          </button>
                        )}
                        <button
                          onClick={() => handleUninstall(model)}
                          className="flex items-center justify-center w-9 h-9 rounded-xl glass border border-[hsl(var(--border)/0.5)] text-muted-foreground hover:text-[hsl(var(--destructive))] hover:border-[hsl(var(--destructive)/0.2)] transition-colors"
                          title="Uninstall"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : model.colab_preparable === false ? (
                      <div className="flex flex-col gap-1.5 w-full">
                        <button
                          disabled
                          className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl bg-[hsl(var(--surface-2))] border border-[hsl(var(--border)/0.4)] text-xs font-medium text-muted-foreground/50 cursor-not-allowed opacity-60"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Can&apos;t Install
                        </button>
                        <p className="text-[10px] text-[hsl(var(--muted-foreground))] leading-tight flex items-start gap-1">
                          <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                          <span>
                            Repo &amp; venv not prepared for this runtime
                            {model.install_block_reason
                              ? ` — ${model.install_block_reason.replace(/\n/g, '; ')}`
                              : ' — exceeds device limits, you cannot install this here.'}
                          </span>
                        </p>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleInstall(model)}
                        className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl bg-[hsl(var(--surface-2))] border border-[hsl(var(--border)/0.3)] text-xs font-medium text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--border))] transition-all"
                      >
                        <Download className="w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]" />
                        Install
                      </button>
                    )}
                  </div>
                </GlassCard>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Boxes className="w-12 h-12 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No models found</p>
          {search && (
            <button
              onClick={() => setSearch('')}
              className="mt-2 text-xs text-[hsl(var(--muted-foreground))] hover:underline"
            >
              Clear search
            </button>
          )}
        </div>
      )}
    </div>
  );
}
