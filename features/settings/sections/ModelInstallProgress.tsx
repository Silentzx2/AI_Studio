"use client";

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Download, GitBranch, Package, CheckCircle, XCircle,
  Zap, Clock, HardDrive, AlertTriangle, Wifi,
  Server, Cloud, Loader2, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export type EnvironmentType = 'vps' | 'colab' | 'codespace' | 'wsl' | 'unknown';

export interface InstallProgressState {
  model_id: string;
  status: 'idle' | 'starting' | 'downloading' | 'extracting' | 'completed' | 'failed';
  phase: 'repo' | 'weights' | 'extract' | null;
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
}

function fmtBytes(n: number): string {
  if (n <= 0) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1_048_576) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1_073_741_824) return `${(n / 1_048_576).toFixed(1)} MB`;
  return `${(n / 1_073_741_824).toFixed(2)} GB`;
}

function fmtSpeed(bps: number): string {
  if (bps <= 0) return '\u2014';
  if (bps < 1024) return `${bps} B/s`;
  if (bps < 1_048_576) return `${(bps / 1024).toFixed(0)} KB/s`;
  return `${(bps / 1_048_576).toFixed(1)} MB/s`;
}

function fmtETA(secs: number | null): string {
  if (secs == null || secs < 0) return '\u2014';
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m < 60) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

const PHASE_LABELS: Record<string, string> = {
  repo: 'Cloning repository',
  weights: 'Downloading weights',
  extract: 'Extracting files',
};

const PHASE_ICONS: Record<string, React.ReactNode> = {
  repo: <GitBranch size={11} className="text-[hsl(var(--neon-blue))]" />,
  weights: <Download size={11} className="text-[hsl(var(--neon-purple))]" />,
  extract: <Package size={11} className="text-[hsl(var(--neon-amber))]" />,
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

function getColabConstraints(): { maxConcurrent: number; note: string; tip: string } {
  return {
    maxConcurrent: 1,
    note: 'Colab has limited network bandwidth and disk I/O.',
    tip: 'Install one model at a time for best results.',
  };
}

function getVPSConstraints(): { maxConcurrent: number; note: string; tip: string } {
  return {
    maxConcurrent: 4,
    note: 'VPS/VM has full network and disk access.',
    tip: 'You can install multiple models concurrently.',
  };
}

export function ModelInstallProgress({
  modelId,
  modelLabel,
  environment,
  onComplete,
  onError,
  onCancel,
}: ModelInstallProgressProps) {
  const [state, setState] = useState<InstallProgressState | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const [cancelled, setCancelled] = useState(false);

  const constraints = environment === 'colab' ? getColabConstraints() : getVPSConstraints();

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

  const barGradient = isDone
    ? 'linear-gradient(90deg, rgba(16,185,129,0.9), rgba(52,211,153,0.9))'
    : isFailed
    ? 'linear-gradient(90deg, rgba(239,68,68,0.9), rgba(248,113,113,0.9))'
    : 'linear-gradient(90deg, rgba(124,58,237,0.9), rgba(168,85,247,0.9))';

  const barGlow = isDone
    ? 'rgba(16,185,129,0.50)'
    : isFailed
    ? 'rgba(239,68,68,0.50)'
    : 'rgba(168,85,247,0.50)';

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
        {isDone && (
          <CheckCircle className="w-5 h-5 text-[hsl(var(--neon-green))]" />
        )}
        {isFailed && (
          <XCircle className="w-5 h-5 text-[hsl(var(--destructive))]" />
        )}
      </div>

      {/* Environment constraints note */}
      {environment === 'colab' && (
        <div className="flex items-start gap-2 p-2 rounded-lg bg-[hsl(var(--neon-amber)/0.08)] border border-[hsl(var(--neon-amber)/0.15)] text-[hsl(var(--neon-amber))] text-xs">
          <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
          <span>{constraints.note}</span>
        </div>
      )}

      {/* Phase label + percent */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          {isDone ? (
            <CheckCircle size={12} className="text-[hsl(var(--neon-green))]" />
          ) : isFailed ? (
            <XCircle size={12} className="text-[hsl(var(--destructive))]" />
          ) : (
            PHASE_ICONS[state.phase ?? ''] ?? <Download size={12} className="text-[hsl(var(--neon-purple))]" />
          )}
          <span className={`font-medium ${
            isDone ? 'text-[hsl(var(--neon-green))]' : isFailed ? 'text-[hsl(var(--destructive))]' : 'text-[hsl(var(--muted-foreground))]'
          }`}>
            {isDone
              ? 'Installation complete'
              : isFailed
              ? 'Installation failed'
              : (PHASE_LABELS[state.phase ?? ''] ?? 'Installing...')}
          </span>
        </div>
        <span className={`font-mono font-bold ${
          isDone ? 'text-[hsl(var(--neon-green))]' : isFailed ? 'text-[hsl(var(--destructive))]' : 'text-[hsl(var(--primary))]'
        }`}>
          {pct.toFixed(1)}%
        </span>
      </div>

      {/* Progress bar */}
      <div
        className="h-2 w-full rounded-full overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.06)' }}
      >
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${isDone ? 100 : pct}%`,
            background: barGradient,
            boxShadow: `0 0 8px ${barGlow}`,
          }}
        />
      </div>

      {/* Speed / ETA / bytes */}
      {!isDone && !isFailed && (
        <div className="flex items-center justify-between text-[11px] font-mono" style={{ color: 'hsl(var(--muted-foreground))' }}>
          <span className="flex items-center gap-1">
            <HardDrive size={10} />
            {state.bytes_total > 0
              ? `${fmtBytes(state.bytes_downloaded)} / ${fmtBytes(state.bytes_total)}`
              : fmtBytes(state.bytes_downloaded)}
          </span>
          <div className="flex items-center gap-3">
            {state.speed_bps > 0 && (
              <span className="flex items-center gap-1 text-[hsl(var(--neon-amber))]">
                <Zap size={10} />
                {fmtSpeed(state.speed_bps)}
              </span>
            )}
            {state.eta_seconds != null && (
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
          className="text-[11px] font-mono truncate"
          style={{ color: 'rgba(168,85,247,0.50)' }}
          title={state.log}
        >
          {state.log}
        </p>
      )}

      {/* Error */}
      {isFailed && state.error && (
        <div className="flex items-start gap-2 text-[hsl(var(--destructive))] text-xs bg-[hsl(var(--destructive)/0.08)] p-2 rounded-lg">
          <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
          <span className="break-all">{state.error}</span>
        </div>
      )}

      {/* Colab-specific tip */}
      {environment === 'colab' && isFailed && (
        <div className="flex items-start gap-2 text-[hsl(var(--neon-amber))] text-xs bg-[hsl(var(--neon-amber)/0.08)] p-2 rounded-lg">
          <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
          <span>Colab network may be unstable. Retry or switch to a VPS for large models.</span>
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