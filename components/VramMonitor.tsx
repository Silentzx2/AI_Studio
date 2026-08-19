'use client';

import { Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GpuMonitorState } from '@/hooks/useGpuMonitor';

interface VramMonitorProps {
  monitor: GpuMonitorState;
}

function buildSparkline(points: number[], width: number, height: number): string {
  if (points.length === 0) return '';
  const step = points.length > 1 ? width / (points.length - 1) : 0;
  return points
    .map((p, i) => {
      const x = i * step;
      const y = height - (p / 100) * height;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

/**
 * Realtime VRAM monitor for the workspace header. Renders a simple SVG
 * sparkline of VRAM usage fetched from the backend. Falls back to a flat
 * gray bar when the backend is offline or no data is available yet.
 */
export function VramMonitor({ monitor }: VramMonitorProps) {
  const { status, vramHistory, usedVramMb, totalVramMb } = monitor;
  const offline = status === 'offline';
  const hasData = status === 'online' && vramHistory.length > 0;

  const usedGb = (usedVramMb / 1024).toFixed(1);
  const totalGb = (totalVramMb / 1024).toFixed(0);

  const path = buildSparkline(vramHistory, 56, 18);
  const last = vramHistory.length ? vramHistory[vramHistory.length - 1] : 0;

  return (
    <div
      className={cn(
        'hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[hsl(var(--border))] shrink-0',
        offline ? 'bg-[hsl(var(--surface-2))]' : 'bg-[hsl(var(--surface-2))]'
      )}
      title={
        offline
          ? 'VRAM: backend offline'
          : hasData
            ? `VRAM: ${usedGb}/${totalGb} GB (${last}%)`
            : 'VRAM: loading…'
      }
    >
      <Activity
        size={12}
        className={offline ? 'text-gray-500' : 'text-green-400'}
      />
      <svg width={56} height={18} viewBox="0 0 56 18" className="overflow-visible">
        {hasData ? (
          <path
            d={path}
            fill="none"
            stroke="rgb(74 222 128)"
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : (
          <line
            x1={0}
            y1={9}
            x2={56}
            y2={9}
            stroke="rgb(107 114 128)"
            strokeWidth={1.5}
            strokeDasharray="3 3"
          />
        )}
      </svg>
      <span
        className={cn(
          'text-[10px] font-bold uppercase tracking-wide',
          offline ? 'text-gray-500' : 'text-green-400'
        )}
      >
        {offline ? 'VRAM' : `${usedGb}/${totalGb}G`}
      </span>
    </div>
  );
}
