"use client";


import { useEffect, useRef, useState } from 'react';
import {
  Download, GitBranch, Package, CheckCircle, XCircle,
  Zap, Clock, HardDrive,
} from 'lucide-react';

export interface DownloadState {
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
  repo: <GitBranch size={11} className="text-blue-400" />,
  weights: <Download size={11} className="text-violet-400" />,
  extract: <Package size={11} className="text-amber-400" />,
};

export function DownloadProgress({
  modelId,
  modelLabel,
  apiBase = '',
  onComplete,
  onError,
}: {
  modelId: string;
  modelLabel: string;
  apiBase?: string;
  onComplete?: () => void;
  onError?: (err: string) => void;
}) {
  const [state, setState] = useState<DownloadState | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const url = `${apiBase}/api/v1/admin/install/stream/${encodeURIComponent(modelId)}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data) as DownloadState & { type?: string };
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
  }, [modelId, apiBase]);

  if (!state || state.status === 'idle' || state.status === 'starting') {
    return (
      <div className="flex items-center gap-2.5 py-2">
        <span
          className="w-2 h-2 rounded-full animate-pulse"
          style={{ background: 'rgba(168,85,247,0.9)', boxShadow: '0 0 6px rgba(168,85,247,0.6)' }}
        />
        <span className="text-xs text-slate-400">Preparing installation...</span>
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
    <div className="space-y-2">
      {/* Phase label + percent */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          {isDone ? (
            <CheckCircle size={12} className="text-emerald-400" />
          ) : isFailed ? (
            <XCircle size={12} className="text-red-400" />
          ) : (
            PHASE_ICONS[state.phase ?? ''] ?? <Download size={12} className="text-violet-400" />
          )}
          <span className={`font-medium ${
            isDone ? 'text-emerald-400' : isFailed ? 'text-red-400' : 'text-slate-200'
          }`}>
            {isDone
              ? 'Installation complete'
              : isFailed
              ? 'Installation failed'
              : (PHASE_LABELS[state.phase ?? ''] ?? 'Installing...')}
          </span>
        </div>
        <span className={`font-mono font-bold ${
          isDone ? 'text-emerald-400' : isFailed ? 'text-red-400' : 'text-violet-300'
        }`}>
          {pct.toFixed(1)}%
        </span>
      </div>

      {/* Progress bar */}
      <div
        className="h-1.5 w-full rounded-full overflow-hidden"
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
        <div className="flex items-center justify-between text-[11px] font-mono" style={{ color: '#475569' }}>
          <span className="flex items-center gap-1">
            <HardDrive size={10} />
            {state.bytes_total > 0
              ? `${fmtBytes(state.bytes_downloaded)} / ${fmtBytes(state.bytes_total)}`
              : fmtBytes(state.bytes_downloaded)}
          </span>
          <div className="flex items-center gap-3">
            {state.speed_bps > 0 && (
              <span className="flex items-center gap-1 text-amber-500">
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
        <p className="text-xs text-red-400 font-mono break-all">{state.error}</p>
      )}
    </div>
  );
}
