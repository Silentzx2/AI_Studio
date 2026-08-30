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
  const reconnectAttemptsRef = useRef(0);

  const connect = useCallback(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const wsUrl = apiUrl.replace(/^http/, 'ws') + '/api/v1/realtime/ws';

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectAttemptsRef.current = 0;
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
      wsRef.current = null;
      // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
      reconnectAttemptsRef.current++;
      const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current - 1), 30000);
      reconnectRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    // Don't reconnect if tab is hidden
    const onVisibility = () => {
      if (!document.hidden && !wsRef.current) {
        reconnectAttemptsRef.current = 0;
        connect();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    connect();
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return state;
}
