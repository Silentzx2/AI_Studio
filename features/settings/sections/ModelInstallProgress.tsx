"use client";

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Download, GitBranch, Package, CheckCircle, XCircle,
  Zap, Clock, HardDrive, AlertTriangle, Wifi,
  Server, Cloud, Loader2, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProgressBar } from '@/components/premium/ProgressBar';
import { Badge } from '@/components/premium/Badge';
import { cn } from '@/lib/utils';

export type EnvironmentType = 'vps' | 'colab' | 'codespace' | 'wsl' | 'unknown';

export interface InstallProgressState {
  model_id: string;
  status: 'idle' | 'starting' | 'downloading' | 'extracting' | 'installing' | 'verifying' | 'completed' | 'failed';
  phase: 'repo' | 'venv' | 'deps' | 'weights' | 'extract' | 'verify' | 'complete' | null;
  file: string | null;
  bytes_downloaded: number;
  bytes_total: number;
  speed_bps: number;
  eta_seconds: number | null;
  percent: number;
  log: string;
  error: string | null;
  started_at: number;
  updated_at: number;
}

interface ModelInstallProgressProps {
  modelId: string;
  modelLabel: string;
  environment: EnvironmentType;
  onComplete?: () => void;
  onError?: (err: string) => void;
  onCancel?: () => void;
  compact?: boolean;
}

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

function fmtETA(secs: number | null): string {
  if (secs == null || secs < 0) return '—';
  if (secs < 60) return `${secs.toFixed(0)}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m < 60) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

const PHASE_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  repo:     { label: 'Cloning repository',     icon: <GitBranch size={11} />,     color: 'text-[hsl(var(--neon-blue))]' },
  venv:     { label: 'Creating virtualenv',    icon: <Zap size={11} />,           color: 'text-[hsl(var(--neon-amber))]' },
  deps:     { label: 'Installing dependencies', icon: <Download size={11} />,      color: 'text-[hsl(var(--neon-purple))]' },
  weights:  { label: 'Downloading weights',    icon: <HardDrive size={11} />,     color: 'text-[hsl(var(--neon-pink))]' },
  extract:  { label: 'Extracting files',       icon: <Package size={11} />,       color: 'text-[hsl(var(--neon-cyan))]' },
  verify:   { label: 'Verifying install',      icon: <CheckCircle size={11} />,   color: 'text-[hsl(var(--neon-green))]' },
  complete: { label: 'Installation complete',  icon: <CheckCircle size={11} />,   color: 'text-[hsl(var(--neon-green))]' },
};

const ENVIRONMENT_LABELS: Record<EnvironmentType, string> = {
  vps: 'VPS/VM',
  colab: 'Google Colab',
  codespace: 'Codespace',
  wsl: 'WSL',
  unknown: 'Unknown',
};

const ENVIRONMENT_ICONS: Record<EnvironmentType, React.ReactNode> = {
  vps: <Server size={12} className="text-[hsl(var(--neon-blue))]" />,
  colab: <Cloud size={12} className="text-[hsl(var(--neon-amber))]" />,
  codespace: <Wifi size={12} className="text-[hsl(var(--neon-green))]" />,
  wsl: <Server size={12} className="text-[hsl(var(--neon-purple))]" />,
  unknown: <Server size={12} className="text-muted-foreground" />,
};

export function ModelInstallProgress({
  modelId,
  modelLabel,
  environment,
  onComplete,
  onError,
  onCancel,
  compact = false,
}: ModelInstallProgressProps) {
  const [state, setState] = useState<InstallProgressState | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const [cancelled, setCancelled] = useState(false);

  useEffect(() => {
    const url = `/api/v1/admin/install/stream/${encodeURIComponent(modelId)}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data) as InstallProgressState & { type?: string };
        if (data.type === 'heartbeat') return;
        setState(data);
        if (data.status === 'completed') {
          es.close();
          onComplete?.();
        } else if (data.status === 'failed') {
          es.close();
          onError?.(data.error || 'Download failed');
        }
      } catch { /* ignore parse errors */ }
    };

    es.onerror = () => { es.close(); };
    return () => { es.close(); };
  }, [modelId, onComplete, onError]);

  const handleCancel = useCallback(() => {
    setCancelled(true);
    onCancel?.();
  }, [onCancel]);

  if (!state || state.status === 'idle' || state.status === 'starting') {
    return (
      <div className="flex items-center gap-3 py-3 px-4 rounded-xl border border-border bg-muted/20">
        <Loader2 className="w-4 h-4 animate-spin text-[hsl(var(--neon-amber))]" />
        <span className="text-sm text-[hsl(var(--muted-foreground))]">Preparing installation for {modelLabel}...</span>
        <span className="ml-auto text-[10px] text-muted-foreground/60">{ENVIRONMENT_LABELS[environment]}</span>
      </div>
    );
  }

  const isDone = state.status === 'completed';
  const isFailed = state.status === 'failed';
  const pct = Math.min(100, Math.max(0, state.percent ?? 0));
  const phase = PHASE_META[state.phase ?? ''] ?? PHASE_META['weights'];
  const speedBps = state.speed_bps ?? 0;
  const bytesTotal = state.bytes_total ?? 0;
  const bytesDownloaded = state.bytes_downloaded ?? 0;

  if (compact) {
    return (
      <div className="space-y-2 p-3 rounded-xl border border-border bg-muted/10">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5">
            {isDone ? <CheckCircle size={12} className="text-[hsl(var(--neon-green))]" /> :
             isFailed ? <XCircle size={12} className="text-[hsl(var(--destructive))]" /> :
             phase.icon}
            <span className={cn('font-medium', isDone ? 'text-[hsl(var(--neon-green))]' : isFailed ? 'text-[hsl(var(--destructive))]' : phase.color)}>
              {isDone ? 'Complete' : isFailed ? 'Failed' : phase.label}
            </span>
          </div>
          <span className="font-mono font-bold text-foreground">{pct.toFixed(1)}%</span>
        </div>
        <ProgressBar value={pct} color={isDone ? 'green' : isFailed ? 'pink' : 'purple'} size="sm" showGlow />
        {!isDone && !isFailed && (
          <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
            <span>{fmtBytes(bytesDownloaded)} / {fmtBytes(bytesTotal)}</span>
            <div className="flex items-center gap-2">
              {speedBps > 0 && <span className="text-[hsl(var(--neon-amber))]">{fmtSpeed(speedBps)}</span>}
              {state.eta_seconds != null && state.eta_seconds > 0 && <span>{fmtETA(state.eta_seconds)}</span>}
            </div>
          </div>
        )}
        {isFailed && state.error && (
          <p className="text-[10px] text-[hsl(var(--destructive))] truncate">{state.error}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4 rounded-xl border border-border bg-muted/10">
      {/* Environment badge + model name */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {ENVIRONMENT_ICONS[environment]}
          <span className="text-xs font-medium text-muted-foreground">
            {ENVIRONMENT_LABELS[environment]}
          </span>
          <span className="text-xs text-muted-foreground/40">|</span>
          <span className="text-sm font-semibold text-foreground">{modelLabel}</span>
        </div>
        {isDone && <CheckCircle className="w-5 h-5 text-[hsl(var(--neon-green))]" />}
        {isFailed && <XCircle className="w-5 h-5 text-[hsl(var(--destructive))]" />}
      </div>

      {/* Phase label + percent */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          {isDone ? (
            <CheckCircle size={12} className="text-[hsl(var(--neon-green))]" />
          ) : isFailed ? (
            <XCircle size={12} className="text-[hsl(var(--destructive))]" />
          ) : (
            phase.icon
          )}
          <span className={cn('font-medium',
            isDone ? 'text-[hsl(var(--neon-green))]' :
            isFailed ? 'text-[hsl(var(--destructive))]' :
            phase.color
          )}>
            {isDone ? 'Installation complete' :
             isFailed ? 'Installation failed' :
             phase.label}
          </span>
        </div>
        <span className={cn('font-mono font-bold',
          isDone ? 'text-[hsl(var(--neon-green))]' :
          isFailed ? 'text-[hsl(var(--destructive))]' :
          'text-[hsl(var(--primary))]'
        )}>
          {pct.toFixed(1)}%
        </span>
      </div>

      {/* Progress bar */}
      <ProgressBar
        value={pct}
        color={isDone ? 'green' : isFailed ? 'pink' : 'purple'}
        size="md"
        showGlow
      />

      {/* Speed / ETA / bytes */}
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
              <span className="flex items-center gap-1 text-[hsl(var(--neon-amber))]">
                <Zap size={10} />
                {fmtSpeed(speedBps)}
              </span>
            )}
            {state.eta_seconds != null && state.eta_seconds > 0 && (
              <span className="flex items-center gap-1">
                <Clock size={10} />
                {fmtETA(state.eta_seconds)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Log line */}
      {state.log && !isDone && !isFailed && (
        <p
          className="text-[11px] font-mono truncate text-muted-foreground/60"
          title={state.log}
        >
          {state.log}
        </p>
      )}

      {/* Error */}
      {isFailed && state.error && (
        <div className="flex items-start gap-2 text-xs text-[hsl(var(--destructive))] bg-[hsl(var(--destructive))]/10 p-2 rounded-lg">
          <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
          <span className="break-all">{state.error}</span>
        </div>
      )}

      {/* Cancel button */}
      {!isDone && !isFailed && onCancel && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            className="gap-1 text-xs text-muted-foreground hover:text-destructive"
          >
            <X size={12} />
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

