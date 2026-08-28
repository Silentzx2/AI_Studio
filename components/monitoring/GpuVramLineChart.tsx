"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { Cpu, Zap, Activity, RefreshCw, Layers, Flame, Gauge } from 'lucide-react';
import { runtimeService } from '@/services/runtimeService';
import { useWorkspace } from '@/features/new-workspace/store/WorkspaceContext';

export interface TelemetryPoint {
  time: string;
  rawTime: number;
  gpu: number;
  vram: number;
  vramUsedGb: number;
  vramTotalGb: number;
  cpu: number;
  ram: number;
  temp: number;
}

interface GpuVramLineChartProps {
  initialHistory?: TelemetryPoint[];
  autoPoll?: boolean;
  pollIntervalMs?: number;
  height?: number | string;
  showDetails?: boolean;
  className?: string;
}

export function GpuVramLineChart({
  initialHistory,
  autoPoll = true,
  pollIntervalMs = 4000,
  height = 260,
  showDetails = true,
  className = '',
}: GpuVramLineChartProps) {
  const { systemStats } = useWorkspace();
  const [data, setData] = useState<TelemetryPoint[]>(() => {
    if (initialHistory && initialHistory.length > 0) return initialHistory;
    // Seed with empty or initial point
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return [
      {
        time: timeStr,
        rawTime: now.getTime(),
        gpu: 0,
        vram: 0,
        vramUsedGb: 0,
        vramTotalGb: systemStats.vramTotalGb || 24,
        cpu: 0,
        ram: 0,
        temp: 0,
      }
    ];
  });

  const [activeMetrics, setActiveMetrics] = useState({
    gpu: true,
    vram: true,
    cpu: false,
  });

  const [maxPoints, setMaxPoints] = useState<number>(30);
  const [isLive, setIsLive] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Function to record a new telemetry sample from real backend
  const recordSample = useCallback(async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    try {
      const status = await runtimeService.getStatus();
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

      const gpuUtil = Math.round(status?.gpu_utilization ?? 0);
      const vramUsedMb = status?.vram_used_mb ?? ((systemStats.vramUsedGb || 0) * 1024);
      const vramTotalMb = status?.vram_total_mb ?? ((systemStats.vramTotalGb || 24) * 1024);
      const vramPct = vramTotalMb > 0 ? Math.min(100, Math.round((vramUsedMb / vramTotalMb) * 100)) : 0;
      const vramUsedGb = Number((vramUsedMb / 1024).toFixed(2));
      const vramTotalGb = Number((vramTotalMb / 1024).toFixed(1));
      const cpuUtil = Math.round(status?.cpu_usage ?? 0);
      const ramUtil = Math.round(status?.ram_usage ?? 0);
      const tempVal = Math.round(status?.gpu_temp ?? 0);

      const newPoint: TelemetryPoint = {
        time: timeStr,
        rawTime: now.getTime(),
        gpu: gpuUtil,
        vram: vramPct,
        vramUsedGb,
        vramTotalGb,
        cpu: cpuUtil,
        ram: ramUtil,
        temp: tempVal,
      };

      setData((prev) => {
        const next = [...prev, newPoint];
        if (next.length > maxPoints) {
          return next.slice(-maxPoints);
        }
        return next;
      });
    } catch {
      // Backend not running or unreachable
    } finally {
      if (isManual) setIsRefreshing(false);
    }
  }, [systemStats.vramUsedGb, systemStats.vramTotalGb, maxPoints]);

  useEffect(() => {
    if (!autoPoll || !isLive) return;

    // Trigger initial sample silently
    void recordSample(false);

    const interval = setInterval(() => {
      if (typeof document === 'undefined' || !document.hidden) {
        void recordSample(false);
      }
    }, pollIntervalMs);

    return () => clearInterval(interval);
  }, [autoPoll, isLive, pollIntervalMs, recordSample]);

  // Derived current metrics and peaks
  const latest = data[data.length - 1] || {
    gpu: 0,
    vram: 0,
    vramUsedGb: 0,
    vramTotalGb: 24,
    cpu: 0,
    temp: 0,
  };

  const peakGpu = useMemo(() => Math.max(...data.map((d) => d.gpu), 0), [data]);
  const peakVram = useMemo(() => Math.max(...data.map((d) => d.vram), 0), [data]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;
    const current = payload[0]?.payload as TelemetryPoint;

    return (
      <div className="p-3 rounded-xl bg-[#12141c]/95 border border-[#2b3040] shadow-2xl backdrop-blur-md text-xs font-mono space-y-1.5 min-w-[170px] z-50">
        <div className="flex items-center justify-between border-b border-[#2b3040] pb-1 mb-1">
          <span className="text-[#9ca3af] font-sans font-semibold text-[11px]">{label}</span>
          <span className="text-[10px] text-[#38bdf8] flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" /> Live
          </span>
        </div>

        {activeMetrics.gpu && (
          <div className="flex items-center justify-between text-[#c084fc]">
            <span className="flex items-center gap-1.5 font-sans font-medium">
              <span className="w-2 h-2 rounded-full bg-[#a855f7]" /> GPU Load:
            </span>
            <span className="font-bold">{current.gpu}%</span>
          </div>
        )}

        {activeMetrics.vram && (
          <div className="flex items-center justify-between text-[#38bdf8]">
            <span className="flex items-center gap-1.5 font-sans font-medium">
              <span className="w-2 h-2 rounded-full bg-[#06b6d4]" /> VRAM Used:
            </span>
            <span className="font-bold">
              {current.vram}% ({current.vramUsedGb} / {current.vramTotalGb} GB)
            </span>
          </div>
        )}

        {activeMetrics.cpu && (
          <div className="flex items-center justify-between text-[#4ade80]">
            <span className="flex items-center gap-1.5 font-sans font-medium">
              <span className="w-2 h-2 rounded-full bg-[#10b981]" /> CPU Usage:
            </span>
            <span className="font-bold">{current.cpu}%</span>
          </div>
        )}

        {current.temp > 0 && (
          <div className="flex items-center justify-between text-[#f59e0b] pt-0.5 border-t border-[#232734]">
            <span className="flex items-center gap-1.5 font-sans font-medium">
              <Flame className="w-3 h-3 text-[#f59e0b]" /> Temp:
            </span>
            <span className="font-bold">{current.temp}°C</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Top Header Controls and Telemetry Pill Summary */}
      {showDetails && (
        <div className="flex flex-wrap items-center justify-between gap-3 pb-1 border-b border-[#21242d]/80">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-[#a855f7]/15 border border-[#a855f7]/30 text-[#c084fc]">
                <Activity className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs lg:text-sm font-bold text-[#f3f4f6] flex items-center gap-2">
                  <span>GPU & VRAM Real-Time Telemetry</span>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-[#1a2234] text-[#38bdf8] border border-[#2b3a58]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" />
                    {isLive ? 'STREAMING' : 'PAUSED'}
                  </span>
                </h3>
                <p className="text-[11px] text-[#8e95a5]">
                  Live Recharts metrics from local FastAPI server (http://localhost:8000)
                </p>
              </div>
            </div>
          </div>

          {/* Quick Metrics Badges */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* GPU Badge */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#171322] border border-[#a855f7]/30 text-xs">
              <Cpu className="w-3.5 h-3.5 text-[#c084fc]" />
              <span className="text-[#a1a1aa] text-[11px]">GPU:</span>
              <span className="font-mono font-bold text-[#e9d5ff]">{latest.gpu}%</span>
              <span className="text-[10px] text-[#c084fc]/70 font-mono">(Peak {peakGpu}%)</span>
            </div>

            {/* VRAM Badge */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#0e1a24] border border-[#06b6d4]/30 text-xs">
              <Zap className="w-3.5 h-3.5 text-[#38bdf8]" />
              <span className="text-[#a1a1aa] text-[11px]">VRAM:</span>
              <span className="font-mono font-bold text-[#bae6fd]">
                {latest.vramUsedGb} / {latest.vramTotalGb} GB ({latest.vram}%)
              </span>
            </div>

            {/* Temp Badge if available */}
            {latest.temp > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#1d1610] border border-[#f59e0b]/30 text-xs">
                <Flame className="w-3.5 h-3.5 text-[#fbbf24]" />
                <span className="font-mono font-bold text-[#fde68a]">{latest.temp}°C</span>
              </div>
            )}

            {/* Toggle Streaming & Refresh */}
            <button
              onClick={() => setIsLive(!isLive)}
              className={`px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                isLive
                  ? 'bg-[#1b2230] border-[#38bdf8]/40 text-[#38bdf8] hover:bg-[#20293a]'
                  : 'bg-[#1f1a1a] border-[#ef4444]/40 text-[#fca5a5] hover:bg-[#2a1e1e]'
              }`}
              title={isLive ? 'Pause live polling' : 'Resume live polling'}
            >
              {isLive ? 'Live' : 'Paused'}
            </button>

            <button
              onClick={() => recordSample(true)}
              disabled={isRefreshing}
              className="p-1 rounded-lg bg-[#181a20] border border-[#2b3040] text-[#9ca3af] hover:text-[#f3f4f6] transition-colors disabled:opacity-50"
              title="Refresh now"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-[#38bdf8]' : ''}`} />
            </button>
          </div>
        </div>
      )}

      {/* Chart Filter Toggles */}
      <div className="flex items-center justify-between text-[11px] text-[#8e95a5] px-1">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveMetrics((m) => ({ ...m, gpu: !m.gpu }))}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md border transition-all ${
              activeMetrics.gpu
                ? 'bg-[#a855f7]/15 border-[#a855f7]/50 text-[#c084fc] font-semibold'
                : 'bg-[#15171e] border-transparent text-[#71717a]'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-[#a855f7]" />
            GPU Load
          </button>

          <button
            onClick={() => setActiveMetrics((m) => ({ ...m, vram: !m.vram }))}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md border transition-all ${
              activeMetrics.vram
                ? 'bg-[#06b6d4]/15 border-[#06b6d4]/50 text-[#38bdf8] font-semibold'
                : 'bg-[#15171e] border-transparent text-[#71717a]'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-[#06b6d4]" />
            VRAM Usage (%)
          </button>

          <button
            onClick={() => setActiveMetrics((m) => ({ ...m, cpu: !m.cpu }))}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md border transition-all ${
              activeMetrics.cpu
                ? 'bg-[#10b981]/15 border-[#10b981]/50 text-[#4ade80] font-semibold'
                : 'bg-[#15171e] border-transparent text-[#71717a]'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-[#10b981]" />
            CPU Usage
          </button>
        </div>

        {/* History Window Size */}
        <div className="flex items-center gap-1">
          <span>Window:</span>
          {[20, 30, 50].map((pts) => (
            <button
              key={pts}
              onClick={() => setMaxPoints(pts)}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
                maxPoints === pts
                  ? 'bg-[#f5c518]/20 text-[#f5c518] font-bold border border-[#f5c518]/40'
                  : 'text-[#71717a] hover:text-[#d4d4d8]'
              }`}
            >
              {pts}s
            </button>
          ))}
        </div>
      </div>

      {/* Main Recharts Area */}
      <div className="w-full relative rounded-2xl bg-[#0a0c10]/90 border border-[#1f232d] p-3 pt-4 overflow-hidden shadow-inner">
        <div style={{ width: '100%', height }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 15, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1c212c" vertical={false} />
              
              <XAxis
                dataKey="time"
                stroke="#4b5563"
                tick={{ fill: '#6b7280', fontSize: 10, fontFamily: 'monospace' }}
                tickLine={false}
                axisLine={{ stroke: '#272d3b' }}
                dy={6}
              />
              
              <YAxis
                domain={[0, 100]}
                stroke="#4b5563"
                tick={{ fill: '#6b7280', fontSize: 10, fontFamily: 'monospace' }}
                tickLine={false}
                axisLine={{ stroke: '#272d3b' }}
                tickFormatter={(val) => `${val}%`}
              />

              <Tooltip content={<CustomTooltip />} />

              {activeMetrics.gpu && (
                <Line
                  type="monotone"
                  dataKey="gpu"
                  name="GPU Load"
                  stroke="#a855f7"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5, fill: '#a855f7', stroke: '#ffffff', strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              )}

              {activeMetrics.vram && (
                <Line
                  type="monotone"
                  dataKey="vram"
                  name="VRAM Usage"
                  stroke="#06b6d4"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5, fill: '#06b6d4', stroke: '#ffffff', strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              )}

              {activeMetrics.cpu && (
                <Line
                  type="monotone"
                  dataKey="cpu"
                  name="CPU Usage"
                  stroke="#10b981"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                  activeDot={{ r: 4, fill: '#10b981', stroke: '#ffffff', strokeWidth: 1.5 }}
                  isAnimationActive={false}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
