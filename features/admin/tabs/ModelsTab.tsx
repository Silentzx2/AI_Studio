"use client";


import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Download, CheckCircle, Loader2,
  HardDrive, Boxes, X, Tag, RefreshCw, AlertCircle,
  Image as ImageIcon, Star, Trash2, ChevronDown, Zap, Clock
} from 'lucide-react';
import { GlassCard } from '@/components/premium/GlassCard';
import { ProgressBar } from '@/components/premium/ProgressBar';
import { Badge } from '@/components/premium/Badge';
import { Spinner } from '@/components/premium/Spinner';
import { adminService } from '@/services/adminService';
import type { AdminModel, InstallProgress } from '@/types';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export function ModelsTab() {
  const [models, setModels] = useState<AdminModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [installProgress, setInstallProgress] = useState<Record<string, InstallProgress>>({});
  const [categories, setCategories] = useState<string[]>(['All']);

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
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { setTimeout(() => load(), 0); }, [load]);

  const filtered = models.filter((m) => {
    const matchesSearch = m.name.toLowerCase().includes(search.toLowerCase()) || m.id.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = category === 'All' || m.type === category;
    return matchesSearch && matchesCategory;
  });

  const installedCount = models.filter((m) => m.installed).length;
  const totalSize = models.filter((m) => m.installed).reduce((sum, m) => sum + m.size_mb, 0);

  const handleInstall = async (model: AdminModel) => {
    setInstallProgress((prev) => ({
      ...prev,
      [model.id]: { 
        model_id: model.id, 
        phase: 'downloading', 
        progress: 0, 
        percent: 0, 
        speed_mbps: 0, 
        downloaded_mb: 0, 
        total_mb: model.size_mb, 
        eta_seconds: 0, 
        status: 'starting' 
      },
    }));

    let stopStream: (() => void) | null = null;
    let installError: Error | null = null;

    try {
      // Step 1: Send install action to backend (starts background task)
      await adminService.modelAction(model.id, 'install');

      // Step 2: Small delay to ensure backend initializes _DL_STATE
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Step 3: THEN open SSE stream to receive progress
      stopStream = adminService.streamInstallProgress(
        model.id,
        (progress) => {
          setInstallProgress((prev) => ({ ...prev, [model.id]: progress }));
        },
        () => {
          // Installation complete
          setInstallProgress((prev) => { const n = { ...prev }; delete n[model.id]; return n; });
          setModels((prev) => prev.map((m) => m.id === model.id ? { ...m, installed: true, status: 'installed' } : m));
          toast.success(`${model.name} installed successfully`);
          load();
        }
      );
    } catch (error) {
      installError = error as Error;
      toast.error(`Failed to install ${model.name}: ${installError.message}`);
      if (stopStream) stopStream();
      setInstallProgress((prev) => { const n = { ...prev }; delete n[model.id]; return n; });
    }
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
      <div className="flex items-center justify-center h-full">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error && models.length === 0) {
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
          <h1 className="text-2xl font-bold tracking-tight">AI Models</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {installedCount} installed · {(totalSize / 1024).toFixed(1)} GB used · {models.length} total
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => { load(); }} className="p-2 rounded-xl glass border border-[hsl(var(--border)/0.5)] text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search models..."
              className="w-64 h-9 pl-9 pr-4 rounded-xl glass text-sm border border-[hsl(var(--border)/0.5)] focus:border-[hsl(var(--neon-purple)/0.4)] focus:outline-none"
            />
          </div>
        </div>
      </div>

      {categories.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-thin pb-1">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={cn(
                'px-3.5 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all border',
                category === cat
                  ? 'bg-gradient-to-r from-[hsl(var(--neon-purple)/0.15)] to-[hsl(var(--neon-blue)/0.05)] text-foreground border-[hsl(var(--neon-purple)/0.3)]'
                  : 'glass text-muted-foreground border-[hsl(var(--border)/0.5)] hover:text-foreground'
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <AnimatePresence>
          {filtered.map((model, i) => {
            const progress = installProgress[model.id];
            const isDownloading = !!progress;
            return (
              <motion.div
                key={model.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: i * 0.05 }}
              >
                <GlassCard hover className="p-5 h-full flex flex-col">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        'flex items-center justify-center w-11 h-11 rounded-xl border relative',
                        model.installed
                          ? 'bg-[hsl(var(--neon-green)/0.1)] border-[hsl(var(--neon-green)/0.2)]'
                          : 'bg-surface-2 border-border'
                      )}>
                        <Boxes className={cn('w-5 h-5', model.installed ? 'text-[hsl(var(--neon-green))]' : 'text-muted-foreground')} />
                        
                        {/* Status Indicator Dot Overlay */}
                        <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                          {isDownloading ? (
                            <>
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[hsl(var(--neon-amber))] opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[hsl(var(--neon-amber))]" title="Loading/Downloading"></span>
                            </>
                          ) : model.installed ? (
                            <>
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[hsl(var(--neon-green))] opacity-30"></span>
                              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[hsl(var(--neon-green))]" title="Online / Installed"></span>
                            </>
                          ) : (
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[hsl(var(--muted-foreground)/0.6)]" title="Offline / Not Installed"></span>
                          )}
                        </span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-foreground">{model.name}</h3>
                          
                          {/* In-line Status Text & Dot */}
                          <div className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground/80">
                            {isDownloading ? (
                              <span className="flex items-center gap-1 text-[hsl(var(--neon-amber))]">
                                <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--neon-amber))] animate-pulse" />
                                Loading...
                              </span>
                            ) : model.installed ? (
                              <span className="flex items-center gap-1 text-[hsl(var(--neon-green))]">
                                <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--neon-green))]" />
                                Online
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-muted-foreground/60">
                                <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--muted-foreground)/0.6)]" />
                                Offline
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant={model.installed ? 'success' : 'default'}>
                            {model.installed ? 'Installed' : 'Available'}
                          </Badge>
                          {model.version && (
                            <span className="text-[10px] text-muted-foreground">v{model.version}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-muted-foreground mb-4">
                    {model.type && (
                      <span className="flex items-center gap-1">
                        <Tag className="w-3 h-3" />
                        {model.type}
                      </span>
                    )}
                    {model.size_mb > 0 && (
                      <span className="flex items-center gap-1">
                        <HardDrive className="w-3 h-3" />
                        {(model.size_mb / 1024).toFixed(1)} GB
                      </span>
                    )}
                  </div>

                  {isDownloading && (
                    <div className="mb-4 space-y-3 p-3 rounded-xl bg-gradient-to-br from-violet-500/10 to-purple-500/5 border border-[hsl(var(--neon-purple)/0.2)]">
                      {/* Animated Header with Phase */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 text-[hsl(var(--neon-purple))] animate-spin" />
                          <span className="text-xs font-medium text-violet-300 capitalize">
                            {progress.phase === 'downloading' ? '⬇️ Downloading Weights...' : 
                             progress.phase === 'extracting' ? '📦 Extracting Files...' :
                             progress.phase === 'repo' ? '🔀 Cloning Repository...' :
                             progress.status === 'installing' ? '⚙️ Installing...' : '🚀 Preparing...'}
                          </span>
                        </div>
                        <span className="text-sm font-bold font-mono text-[hsl(var(--neon-purple))] animate-pulse">
                          {Math.round(progress.progress)}%
                        </span>
                      </div>
                      
                      {/* Enhanced Progress Bar with Glow */}
                      <div className="relative">
                        <ProgressBar value={progress.progress} color="purple" size="md" showGlow />
                      </div>

                      {/* Detailed Stats Grid */}
                      <div className="grid grid-cols-3 gap-2">
                        {/* Speed with icon */}
                        <div className="flex flex-col items-center p-2 rounded-lg bg-[hsl(var(--surface-0)/0.2)]">
                          <div className="flex items-center gap-1 text-[hsl(var(--neon-amber))]">
                            <Zap className="w-3 h-3" />
                            <span className="text-[10px] font-medium">Speed</span>
                          </div>
                          <span className="text-sm font-bold font-mono text-amber-300">
                            {progress.speed_mbps?.toFixed(1) ?? '0'}
                            <span className="text-[10px] font-normal text-muted-foreground">MB/s</span>
                          </span>
                        </div>
                        
                        {/* Downloaded with icon */}
                        <div className="flex flex-col items-center p-2 rounded-lg bg-[hsl(var(--surface-0)/0.2)]">
                          <div className="flex items-center gap-1 text-[hsl(var(--neon-blue))]">
                            <HardDrive className="w-3 h-3" />
                            <span className="text-[10px] font-medium">Progress</span>
                          </div>
                          <span className="text-sm font-bold font-mono text-[hsl(var(--neon-blue))]">
                            {progress.downloaded_mb?.toFixed(0) ?? '0'}
                            <span className="text-[10px] font-normal text-muted-foreground">/ {((progress.total_mb ?? 0) / 1024).toFixed(1)}GB</span>
                          </span>
                        </div>
                        
                        {/* ETA with icon */}
                        <div className="flex flex-col items-center p-2 rounded-lg bg-[hsl(var(--surface-0)/0.2)]">
                          <div className="flex items-center gap-1 text-[hsl(var(--neon-green))]">
                            <Clock className="w-3 h-3" />
                            <span className="text-[10px] font-medium">ETA</span>
                          </div>
                          <span className="text-sm font-bold font-mono text-[hsl(var(--neon-green))]">
                            {progress.eta_seconds > 0 
                              ? (progress.eta_seconds < 60 ? `${Math.round(progress.eta_seconds)}s` :
                                 progress.eta_seconds < 3600 ? `${Math.floor(progress.eta_seconds / 60)}m ${Math.round(progress.eta_seconds % 60)}s` :
                                 `${Math.floor(progress.eta_seconds / 3600)}h ${Math.floor((progress.eta_seconds % 3600) / 60)}m`)
                              : '--:--'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="mt-auto flex items-center gap-2">
                    {model.installed ? (
                      <>
                        <button className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl glass border border-[hsl(var(--border)/0.5)] text-xs text-muted-foreground hover:text-foreground transition-colors">
                          <CheckCircle className="w-3.5 h-3.5 text-[hsl(var(--neon-green))]" />
                          Ready
                        </button>
                        <button
                          onClick={() => handleUninstall(model)}
                          className="flex items-center justify-center w-9 h-9 rounded-xl glass border border-[hsl(var(--border)/0.5)] text-muted-foreground hover:text-[hsl(var(--destructive))] hover:border-[hsl(var(--destructive)/0.2)] transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : isDownloading ? (
                      <button
                        onClick={() => {
                          adminService.modelAction(model.id, 'cancel').catch(() => {});
                          setInstallProgress((prev) => { const n = { ...prev }; delete n[model.id]; return n; });
                        }}
                        className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl bg-[hsl(var(--destructive)/0.1)] border border-[hsl(var(--destructive)/0.2)] text-xs text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive)/0.2)] transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                        Cancel
                      </button>
                    ) : (
                      <button
                        onClick={() => handleInstall(model)}
                        className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl bg-gradient-to-r from-[hsl(var(--neon-purple)/0.15)] to-[hsl(var(--neon-blue)/0.1)] border border-[hsl(var(--neon-purple)/0.2)] text-xs font-medium text-foreground hover:border-[hsl(var(--neon-purple)/0.4)] transition-all"
                      >
                        <Download className="w-3.5 h-3.5 text-[hsl(var(--neon-purple))]" />
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
        </div>
      )}

    </div>
  );
}