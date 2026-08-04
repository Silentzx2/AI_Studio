"use client";


import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ChevronDown, CheckCircle, AlertCircle, Loader2, HardDrive, Shield, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { runtimeService, type ProviderOption } from '@/services/runtimeService';

type ModelStatus = 'installed' | 'not-installed' | 'downloading' | 'verified';

function getModelStatus(model: ProviderOption, activeId: string): ModelStatus {
  if (!model.available) return 'not-installed';
  if (model.id === activeId) return 'verified';
  return 'installed';
}

const STATUS_CONFIG: Record<ModelStatus, { label: string; icon: React.ComponentType<{ className?: string }>; class: string; dot: string }> = {
  installed: { label: 'Installed', icon: CheckCircle, class: 'text-[hsl(var(--neon-green))]', dot: 'bg-[hsl(var(--neon-green))]' },
  'not-installed': { label: 'Not Installed', icon: AlertCircle, class: 'text-[hsl(var(--neon-amber))]', dot: 'bg-[hsl(var(--neon-amber))]' },
  downloading: { label: 'Downloading', icon: Loader2, class: 'text-[hsl(var(--neon-blue))]', dot: 'bg-[hsl(var(--neon-blue))]' },
  verified: { label: 'Active', icon: Shield, class: 'text-[hsl(var(--neon-purple))]', dot: 'bg-[hsl(var(--neon-purple))]' },
};

function formatVRAM(mb: number | undefined): string {
  if (!mb || mb === 0) return 'No GPU req.';
  if (mb >= 1000) return `${(mb / 1000).toFixed(0)} GB VRAM`;
  return `${mb} MB VRAM`;
}

export function ModelSelector({ value, onChange, className }: { value: string; onChange: (id: string) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [models, setModels] = useState<ProviderOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // // eslint-disable-next-line react-hooks/set-state-in-effect
  const loadModels = useCallback(() => {
    let cancelled = false;
    setTimeout(() => {
      if (!cancelled) {
        setLoading(true);
        setError(null);
      }
    }, 0);
    runtimeService.getOptions()
      .then((opts) => {
        if (cancelled) return;
        if (opts && opts.three_d_models.length > 0) {
          setModels(opts.three_d_models);
        } else {
          setError('No models available');
        }
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load models');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // // eslint-disable-next-line react-hooks/set-state-in-effect
   
  useEffect(() => {
    const cleanup = loadModels();
    return cleanup;
  }, [loadModels]);

  // Periodically refresh the model list so newly installed models appear
   
  useEffect(() => {
    const interval = setInterval(() => {
      runtimeService.getOptions()
        .then((opts) => {
          if (opts && opts.three_d_models.length > 0) {
            setModels(opts.three_d_models);
            setError(null);
          }
        })
        .catch(() => { /* silent — don't overwrite existing state */ });
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  // Refresh the model list each time the dropdown opens
   
  useEffect(() => {
    if (open) loadModels();
  }, [open, loadModels]);

   
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = models.filter((m) => m.label.toLowerCase().includes(search.toLowerCase()) || m.id.toLowerCase().includes(search.toLowerCase()));
  const selected = models.find((m) => m.id === value);
  const selectedStatus = selected ? getModelStatus(selected, value) : 'not-installed';

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-3 py-2.5 rounded-xl input-premium hover:border-[hsl(var(--border)/0.7)] group"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {selected ? (
            <>
              <div className={cn('w-2 h-2 rounded-full shrink-0', STATUS_CONFIG[selectedStatus].dot, selectedStatus === 'verified' && 'animate-[pulse-glow_3s_ease-in-out_infinite] shadow-[0_0_6px_hsl(var(--neon-purple)/0.4)]')} />
              <div className="min-w-0 text-left">
                <p className="text-sm font-medium text-foreground truncate">{selected.label}</p>
                <p className="text-[10px] text-muted-foreground/50">{formatVRAM(selected.vramMb)}</p>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground/50">Select a model...</p>
          )}
        </div>
        <ChevronDown className={cn('w-4 h-4 text-muted-foreground/60 transition-all duration-200 shrink-0', open && 'rotate-180 text-foreground')} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 right-0 mt-1.5 z-50 rounded-xl glass-ultra border border-[hsl(var(--border)/0.35)] shadow-premium-lg overflow-hidden"
          >
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[hsl(var(--border)/0.2)]">
              <Search className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search models..." className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/30 text-foreground" />
              {search && <button onClick={() => setSearch('')} className="text-muted-foreground/50 hover:text-foreground transition-colors"><X className="w-3.5 h-3.5" /></button>}
            </div>
            <div className="max-h-64 overflow-y-auto scrollbar-neon">
              {loading ? (
                <div className="empty-state py-8">
                  <div className="empty-state-icon">
                    <Loader2 className="w-5 h-5 text-muted-foreground/30 animate-spin" />
                  </div>
                  <span className="text-sm text-muted-foreground/50 mt-2">Loading models...</span>
                </div>
              ) : error ? (
                <div className="empty-state py-8">
                  <div className="empty-state-icon !border-destructive/20 !bg-destructive/5">
                    <AlertCircle className="w-5 h-5 text-destructive/50" />
                  </div>
                  <p className="text-sm text-muted-foreground/50 mt-1">{error}</p>
                  <button onClick={() => {
                    loadModels();
                  }} className="chip mt-2 text-[hsl(var(--neon-purple))] hover:text-foreground">Retry</button>
                </div>
              ) : filtered.length === 0 ? (
                <div className="empty-state py-8">
                  <div className="empty-state-icon">
                    <Search className="w-5 h-5 text-muted-foreground/30" />
                  </div>
                  <p className="text-sm text-muted-foreground/50 mt-1">No models found</p>
                </div>
              ) : (
                <div className="py-1">
                  {filtered.map((model) => {
                    const status = getModelStatus(model, value);
                    const cfg = STATUS_CONFIG[status];
                    const Icon = cfg.icon;
                    const isSelected = model.id === value;
                    return (
                      <button
                        key={model.id}
                        onClick={() => { onChange(model.id); setOpen(false); }}
                        disabled={!model.available}
                        className={cn(
                          'flex items-center gap-3 w-full px-3 py-2.5 text-left transition-all duration-200',
                          isSelected
                            ? 'bg-[hsl(var(--neon-purple)/0.08)] shadow-[inset_0_0_0_1px_hsl(var(--neon-purple)/0.25),0_0_12px_hsl(var(--neon-purple)/0.06)]'
                            : 'hover:bg-white/[0.03] hover:shadow-[inset_0_0_0_1px_hsl(var(--border)/0.15)]',
                          !model.available && 'opacity-40 cursor-not-allowed'
                        )}
                      >
                        <Icon className={cn('w-4 h-4 shrink-0', cfg.class)} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{model.label}</p>
                          <p className="text-[10px] text-muted-foreground/50">{formatVRAM(model.vramMb)}</p>
                        </div>
                        {isSelected && <CheckCircle className="w-3.5 h-3.5 text-[hsl(var(--neon-purple))] shrink-0 drop-shadow-[0_0_6px_hsl(var(--neon-purple)/0.5)]" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between px-3 py-2 border-t border-[hsl(var(--border)/0.2)] bg-[hsl(var(--surface-2)/0.15)]">
              <span className="panel-section-label">{filtered.filter((m) => m.available).length} installed · {filtered.length} total</span>
              <button onClick={() => setOpen(false)} className="text-[10px] text-[hsl(var(--neon-purple)/0.7)] hover:text-[hsl(var(--neon-purple))] transition-colors">Manage models</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}