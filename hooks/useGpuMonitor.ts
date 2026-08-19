import { useEffect, useRef, useState } from 'react';
import { runtimeService } from '@/services/runtimeService';
import type { GpuInfo } from '@/types';

export type MonitorStatus = 'loading' | 'online' | 'offline';

export interface GpuMonitorState {
  status: MonitorStatus;
  gpus: GpuInfo[];
  totalVramMb: number;
  usedVramMb: number;
  vramHistory: number[];
}

const MAX_POINTS = 60;

/**
 * Live GPU + VRAM monitor backed by /api/v1/runtime/status.
 * Polls the engine every 2s and keeps a rolling VRAM-usage history so the
 * header sparkline renders real-time data without a streaming connection.
 * ponytail: 2s poll, single in-flight guard, capped ring buffer.
 */
export function useGpuMonitor(pollMs = 2000): GpuMonitorState {
  const [state, setState] = useState<GpuMonitorState>({
    status: 'loading',
    gpus: [],
    totalVramMb: 0,
    usedVramMb: 0,
    vramHistory: [],
  });
  const historyRef = useRef<number[]>([]);
  const inFlight = useRef(false);

  useEffect(() => {
    let active = true;

    const tick = async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const status = await runtimeService.getStatus();
        if (!active) return;
        if (!status) {
          setState((prev) => ({ ...prev, status: 'offline' }));
          return;
        }
        const gpus = status.gpus ?? [];
        const total = gpus.reduce((sum, g) => sum + g.vram_mb, 0);
        const used = gpus.reduce((sum, g) => sum + g.vram_used_mb, 0);
        const percent = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
        const next = [...historyRef.current, percent].slice(-MAX_POINTS);
        historyRef.current = next;
        setState({
          status: 'online',
          gpus,
          totalVramMb: total,
          usedVramMb: used,
          vramHistory: next,
        });
      } catch {
        if (active) setState((prev) => ({ ...prev, status: 'offline' }));
      } finally {
        inFlight.current = false;
      }
    };

    tick();
    const id = setInterval(tick, pollMs);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [pollMs]);

  return state;
}
