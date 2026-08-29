'use client';

import { useEffect, useState, useRef, useCallback } from 'react';

export interface RealtimeGpuData {
  available: boolean;
  devices: Array<{
    index: number;
    name: string;
    vram_mb: number;
    free_vram_mb: number;
    utilization?: number;
    temperature?: number;
  }>;
  free_vram_mb: number;
  total_vram_mb: number;
}

export interface RealtimeHealthData {
  gpu: Record<string, unknown>;
  cuda: Record<string, unknown>;
  system_resources: Record<string, unknown>;
  [key: string]: unknown;
}

export interface RealtimeState {
  connected: boolean;
  gpu: RealtimeGpuData | null;
  health: RealtimeHealthData | null;
}

/**
 * Connect to the real-time WebSocket endpoint for live system updates.
 *
 * Falls back to `null` data when disconnected — consumers should continue
 * polling as a fallback when `connected` is false or `gpu`/`health` is null.
 */
export function useRealtime(): RealtimeState {
  const [state, setState] = useState<RealtimeState>({
    connected: false,
    gpu: null,
    health: null,
  });
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const connect = useCallback(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const wsUrl = apiUrl.replace(/^http/, 'ws') + '/api/v1/realtime/ws';

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setState((s) => ({ ...s, connected: true }));
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'initial') {
          setState((s) => ({
            ...s,
            gpu: msg.data.gpu,
            health: msg.data.health,
          }));
        } else if (msg.type === 'gpu') {
          setState((s) => ({ ...s, gpu: msg.data }));
        } else if (msg.type === 'health') {
          setState((s) => ({ ...s, health: msg.data }));
        }
        // ignore keepalive/pong
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      setState((s) => ({ ...s, connected: false }));
      // Reconnect after 5s
      reconnectRef.current = setTimeout(connect, 5000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
    };
  }, [connect]);

  return state;
}
