"use client";


import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Download, CheckCircle, Loader2,
  HardDrive, Boxes, X, Tag, RefreshCw, AlertCircle,
  Trash2, ChevronDown, Zap, Clock,
  Play, Pause, Unplug, Paintbrush,
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
  repo:     { label: 'Cloning repository',     icon: <Boxes size={13} />,          color: 'text-[hsl(var(--blue-500))]' },
  venv:     { label: 'Creating virtualenv',    icon: <Zap size={13} />,            color: 'text-[hsl(var(--amber-500))]' },
  deps:     { label: 'Installing dependencies', icon: <Download size={13} />,       color: 'text-[hsl(var(--cyan-500))]' },
  weights:  { label: 'Downloading weights',    icon: <HardDrive size={13} />,      color: 'text-[hsl(var(--purple-500))]' },
  extract:  { label: 'Extracting files',       icon: <Loader2 size={13} />,        color: 'text-[hsl(var(--orange-500))]' },
  verify:   { label: 'Verifying install',      icon: <CheckCircle size={13} />,    color: 'text-[hsl(var(--green-500))]' },
  complete: { label: 'Installation complete',  icon: <CheckCircle size={13} />,    color: 'text-[hsl(var(--green-500))]' },
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

  const barColor = isDone ? 'green' : isFailed ? 'amber' : progress.phase === 'weights' ? 'purple' : progress.phase === 'deps' ? 'cyan' : progress.phase === 'venv' ? 'amber' : progress.phase === 'repo' ? 'blue' : 'purple';

  return (
    <div className="mt-3 space-y-2.5 p-3 rounded-xl card-minimal">
      {/* Phase + percent */}
      <div className="flex items-center justify-between">
        <div className={cn('flex items-center gap-1.5 text-xs font-medium', phase.color)}>
          {isDone ? <CheckCircle size={12} className="text-[hsl(var(--green-500))]" /> :
           isFailed ? <AlertCircle size={12} className="text-[hsl(var(--destructive))]" /> :
           phase.icon}
          <span>{isDone ? 'Installation complete' : isFailed ? 'Installation failed' : phase.label}</span>
        </div>
        <span className={cn(
          'text-sm font-bold font-mono',
          isDone ? 'text-[hsl(var(--green-500))]' : isFailed ? 'text-[hsl(var(--destructive))]' : phase.color
        )}>
          {pct.toFixed(1)}%
        </span>
      </div>

      {/* Progress bar */}
      <ProgressBar value={pct} color={barColor} size="md" showGlow />

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
  const [auxPromptModel, setAuxPromptModel] = useState<AdminModel | null>(null);
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

  // Poll install status for native-build updates (reduced to 10s, tab-aware)
  useEffect(() => {
    if (models.length === 0) return;
    let active = true;
    pollCleanup.current = setInterval(async () => {
      if (!active) return;
      if (typeof document !== 'undefined' && document.hidden) return;
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
    }, 10000);
    return () => {
      active = false;
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

  // Restore install state from persisted progress on mount (only once)
  const restoreAttemptedRef = useRef(false);
  useEffect(() => {
    if (restoreAttemptedRef.current) return;
    if (models.length === 0) return;
    restoreAttemptedRef.current = true;

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
    restoreProgress();
  }, [models.length, installProgress, reconnectToInstall]);

  const filtered = models.filter((m) => {
    const matchesSearch = m.name.toLowerCase().includes(search.toLowerCase()) ||
                          m.id.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = category === 'All' || m.type === category;
    return matchesSearch && matchesCategory;
  });

  const installedCount = models.filter((m) => m.installed).length;
  const totalSizeGB = models.filter((m) => m.installed).reduce((sum, m) => sum + (m.size_mb || 0), 0) / 1024;

  const initiateInstall = (model: AdminModel) => {
    // Check if model has optional auxiliary weights (e.g. Hunyuan3D-2 Mini paint weights) that are not yet downloaded
    const uninstalledAux = model.auxiliary_weights?.filter((a) => !a.required && a.state !== 'ok') || [];
    if (uninstalledAux.length > 0) {
      setAuxPromptModel(model);
      return;
    }
    handleInstall(model, false);
  };

  const handleInstall = async (model: AdminModel, includeAuxiliary = false) => {
    setAuxPromptModel(null);
    // Cancel any existing stream for this model
    if (streamCleanups.current[model.id]) {
      streamCleanups.current[model.id]();
    }

    const auxGb = includeAuxiliary
      ? (model.auxiliary_weights?.filter((a) => !a.required).reduce((sum, a) => sum + (a.size_estimate_gb || 0), 0) || 0)
      : 0;
    const estMb = (model.size_mb || 0) + (auxGb * 1024);

    setInstallProgress((prev) => ({
      ...prev,
      [model.id]: {
        model_id: model.id,
        phase: 'repo',
        progress: 0,
        percent: 0,
        speed_mbps: 0,
        downloaded_mb: 0,
        total_mb: estMb,
        eta_seconds: 0,
        status: 'starting',
      },
    }));

    let stopStream: (() => void) | null = null;

    try {
      await adminService.modelAction(model.id, 'install', { include_auxiliary: includeAuxiliary });

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

  const handleDownloadAuxiliary = async (model: AdminModel) => {
    if (streamCleanups.current[model.id]) {
      streamCleanups.current[model.id]();
    }

    const auxGb = model.auxiliary_weights?.filter((a) => !a.required).reduce((sum, a) => sum + (a.size_estimate_gb || 0), 0) || 7;

    setInstallProgress((prev) => ({
      ...prev,
      [model.id]: {
        model_id: model.id,
        phase: 'weights',
        progress: 0,
        percent: 0,
        speed_mbps: 0,
        downloaded_mb: 0,
        total_mb: auxGb * 1024,
        eta_seconds: 0,
        status: 'starting',
      },
    }));

    let stopStream: (() => void) | null = null;

    try {
      await adminService.modelAction(model.id, 'download_auxiliary');

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
          toast.success(`${model.name} paint weights downloaded successfully`);
          load();
        },
      );

      streamCleanups.current[model.id] = stopStream;
    } catch (error) {
      toast.error(`Failed to download paint weights for ${model.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
            <Boxes className="w-6 h-6 text-[hsl(var(--purple-500))]" />
            AI Models
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            <span className="text-[hsl(var(--green-500))] font-semibold">{installedCount}</span> installed · {totalSizeGB.toFixed(1)} GB used · <span className="text-[hsl(var(--muted-foreground))]">{models.length}</span> total
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => load()}
            className="p-2 rounded-xl glass border border-[hsl(var(--border))] text-muted-foreground hover:text-[hsl(var(--muted-foreground))] transition-colors"
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
              className="w-64 h-9 pl-9 pr-4 rounded-xl glass text-sm border border-[hsl(var(--border))] focus:border-[hsl(var(--border))] focus:outline-none transition-colors"
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
                  : 'glass text-muted-foreground border-[hsl(var(--border))] hover:text-[hsl(var(--muted-foreground))]'
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
            <Zap className="w-4 h-4 text-[hsl(var(--amber-500))]" />
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
            <div key={key} className="flex items-center justify-between p-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))]">
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
                          ? 'bg-[hsl(var(--green-500)/0.08)] border-[hsl(var(--green-500)/0.2)]'
                          : 'bg-[hsl(var(--surface-2))] border-[hsl(var(--border))]'
                      )}>
                        <Boxes className={cn('w-5 h-5', model.installed ? 'text-[hsl(var(--green-500))]' : 'text-muted-foreground')} />
                        {/* Status dot */}
                        <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                          {isDownloading ? (
                            <>
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[hsl(var(--blue-500))] opacity-75" />
                              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[hsl(var(--blue-500))]" />
                            </>
                          ) : model.installed ? (
                            <>
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[hsl(var(--green-500))] opacity-30" />
                              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[hsl(var(--green-500))]" />
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
                            <Badge
                              variant={model.installed ? 'success' : (model.repo_ready && model.venv_ready ? 'warning' : 'default')}
                              size="sm"
                              dot
                            >
                              {model.installed ? 'Installed' : (model.repo_ready && model.venv_ready ? 'Weights Missing' : 'Available')}
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
                            {model.auxiliary_weights && model.auxiliary_weights.length > 0 && (
                              <span className={cn(
                                "text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded-md",
                                model.auxiliary_weights.some((a) => a.state === 'ok')
                                  ? "bg-[hsl(var(--green-500)/0.12)] text-[hsl(var(--green-500))]"
                                  : "bg-[hsl(var(--amber-500)/0.12)] text-[hsl(var(--amber-500))]"
                              )}>
                                <Paintbrush size={9} />
                                {model.auxiliary_weights.some((a) => a.state === 'ok') ? "Paint Ready" : "Projection Texturing"}
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
                      <div className="flex flex-col gap-0.5 bg-[hsl(var(--surface-2))] p-2 rounded-lg border border-[hsl(var(--border))]">
                        <span className="text-[10px] text-muted-foreground uppercase">Size</span>
                        <span className="font-bold text-[hsl(var(--muted-foreground))] text-[11px]">{(model.size_mb / 1024).toFixed(1)} GB</span>
                      </div>
                    )}
                    {model.vram_required_mb ? (
                      <div className="flex flex-col gap-0.5 bg-[hsl(var(--surface-2))] p-2 rounded-lg border border-[hsl(var(--border))]">
                        <span className="text-[10px] text-muted-foreground uppercase">VRAM</span>
                        <span className="font-bold text-[hsl(var(--muted-foreground))] text-[11px]">{(model.vram_required_mb / 1024).toFixed(1)} GB</span>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-0.5 bg-[hsl(var(--surface-2))] p-2 rounded-lg border border-[hsl(var(--border))]">
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
                        {model.auxiliary_weights?.some((a) => !a.required && a.state !== 'ok') && !isDownloading && (
                          <button
                            onClick={() => handleDownloadAuxiliary(model)}
                            className="flex items-center justify-center gap-1 h-9 px-2.5 rounded-xl bg-[hsl(var(--purple-500)/0.08)] border border-[hsl(var(--purple-500)/0.2)] text-xs font-medium text-[hsl(var(--purple-500))] hover:bg-[hsl(var(--purple-500)/0.15)] transition-colors"
                            title="Download optional neural paint & PBR texturing weights (+7 GB)"
                          >
                            <Paintbrush className="w-3.5 h-3.5" /> + Paint (~7GB)
                          </button>
                        )}
                        {model.loaded ? (
                          <button
                            onClick={() => adminService.modelAction(model.id, 'unload')}
                            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl glass border border-[hsl(var(--border))] text-xs text-muted-foreground hover:text-[hsl(var(--muted-foreground))] transition-colors"
                          >
                            <Pause className="w-3.5 h-3.5" /> Unload
                          </button>
                        ) : (
                          <button
                            onClick={() => adminService.modelAction(model.id, 'load')}
                            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl bg-[hsl(var(--green-500)/0.08)] border border-[hsl(var(--green-500)/0.2)] text-xs text-[hsl(var(--green-500))] hover:bg-[hsl(var(--green-500)/0.15)] transition-colors"
                          >
                            <Play className="w-3.5 h-3.5" /> Load
                          </button>
                        )}
                        <button
                          onClick={() => handleUninstall(model)}
                          className="flex items-center justify-center w-9 h-9 rounded-xl glass border border-[hsl(var(--border))] text-muted-foreground hover:text-[hsl(var(--destructive))] hover:border-[hsl(var(--destructive)/0.2)] transition-colors"
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
                        onClick={() => initiateInstall(model)}
                        className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl bg-[hsl(var(--purple-500)/0.08)] border border-[hsl(var(--purple-500)/0.2)] text-xs font-medium text-[hsl(var(--purple-500))] hover:bg-[hsl(var(--purple-500)/0.15)] transition-all"
                      >
                        <Download className="w-3.5 h-3.5" />
                        {model.repo_ready && model.venv_ready ? 'Install Weights' : 'Install'}
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

      {/* Auxiliary Weights Prompt Modal */}
      <AnimatePresence>
        {auxPromptModel && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-2xl shadow-2xl p-6 flex flex-col gap-4 text-[hsl(var(--foreground))]"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-[hsl(var(--purple-500)/0.1)] border border-[hsl(var(--purple-500)/0.2)] flex items-center justify-center text-[hsl(var(--purple-500))]">
                    <Paintbrush className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-base">Include Paint Weights?</h3>
                    <p className="text-xs text-muted-foreground">{auxPromptModel.name}</p>
                  </div>
                </div>
                <button
                  onClick={() => setAuxPromptModel(null)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-[hsl(var(--surface-2))]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">
                This model supports optional neural paint &amp; PBR texture generation (+7 GB). Without paint weights, texturing will use projection mapping.
              </p>

              <div className="flex flex-col gap-2.5 pt-1">
                <button
                  onClick={() => handleInstall(auxPromptModel, true)}
                  className="flex flex-col text-left p-3.5 rounded-xl border border-[hsl(var(--purple-500)/0.3)] bg-[hsl(var(--purple-500)/0.08)] hover:bg-[hsl(var(--purple-500)/0.15)] transition-all group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[hsl(var(--purple-500))]">
                      Download Shape + Paint Weights
                    </span>
                    <Badge variant="default" className="text-[10px] bg-[hsl(var(--purple-500)/0.1)] text-[hsl(var(--purple-500))] border-[hsl(var(--purple-500)/0.3)]">
                      ~{((auxPromptModel.size_estimate_gb || 8) + 7).toFixed(0)} GB
                    </Badge>
                  </div>
                  <span className="text-[11px] text-muted-foreground mt-1">
                    Enables full neural PBR texturing with normal and roughness maps.
                  </span>
                </button>

                <button
                  onClick={() => handleInstall(auxPromptModel, false)}
                  className="flex flex-col text-left p-3.5 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] hover:bg-[hsl(var(--surface-3))] transition-all"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">
                      Download Shape Only
                    </span>
                    <Badge variant="default" className="text-[10px]">
                      ~{(auxPromptModel.size_estimate_gb || 8).toFixed(0)} GB
                    </Badge>
                  </div>
                  <span className="text-[11px] text-muted-foreground mt-1">
                    Fastest download. Texturing will use projection mapping.
                  </span>
                </button>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setAuxPromptModel(null)}
                  className="px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
