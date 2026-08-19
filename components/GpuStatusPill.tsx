'use client';

import { Cpu } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GpuInfo } from '@/types';
import type { MonitorStatus } from '@/hooks/useGpuMonitor';

interface GpuStatusPillProps {
  index: number;
  gpu?: GpuInfo;
  status: MonitorStatus;
}

/**
 * Single GPU status pill for the workspace header.
 * Green when the GPU is active/online, red when the backend is unreachable,
 * gray while loading or when that GPU slot is absent.
 */
export function GpuStatusPill({ index, gpu, status }: GpuStatusPillProps) {
  const active = status === 'online' && !!gpu;
  const offline = status === 'offline';

  const dot = offline
    ? 'bg-red-500'
    : active
      ? 'bg-green-500'
      : 'bg-gray-500';

  const labelColor = offline
    ? 'text-red-400'
    : active
      ? 'text-green-400'
      : 'text-gray-400';

  const vramGb = gpu ? (gpu.vram_mb / 1024).toFixed(0) : null;

  return (
    <div
      className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] text-[10px] font-bold uppercase tracking-wide shrink-0"
      title={
        offline
          ? `GPU ${index}: backend offline`
          : active
            ? `GPU ${index}: ${gpu.name} (${vramGb} GB)`
            : `GPU ${index}: ${status === 'loading' ? 'checking…' : 'not detected'}`
      }
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', dot, active && 'animate-pulse')} />
      <Cpu size={12} className={labelColor} />
      <span className={labelColor}>
        {active && vramGb ? `GPU${index} ${vramGb}G` : `GPU${index}`}
      </span>
    </div>
  );
}
