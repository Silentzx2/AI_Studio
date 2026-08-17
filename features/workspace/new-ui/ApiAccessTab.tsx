"use client";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Code, Copy, Check, Key, TrendingUp, Cpu, Server, Activity } from 'lucide-react';

type MetricsPoint = { incoming: number; completed: number; failed: number };
type LogEntry = { id: number; timestamp: string; endpoint: string; status: number; latency: string };

const ENDPOINTS = [
  '/v1/generate',
  '/v1/mesh/export',
  '/v1/texture/apply',
  '/v1/rig/auto',
  '/v1/model/status',
  '/v1/batch/process',
];

const MAX_POINTS = 30;

function genPoint(prev: MetricsPoint): MetricsPoint {
  const incoming = Math.max(0, Math.min(150, prev.incoming + Math.round((Math.random() - 0.45) * 20)));
  const completed = Math.max(0, Math.min(incoming, prev.completed + Math.round((Math.random() - 0.42) * 14)));
  const failed = Math.max(0, Math.min(incoming - completed, Math.round(Math.random() * 6)));
  return { incoming, completed, failed };
}

function makeLogEntry(id: number): LogEntry {
  const status = Math.random() > 0.82 ? 500 : 200;
  const latency = status === 500
    ? `${(Math.random() * 800 + 200).toFixed(0)}ms`
    : `${(Math.random() * 300 + 40).toFixed(0)}ms`;
  return {
    id,
    timestamp: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    endpoint: ENDPOINTS[Math.floor(Math.random() * ENDPOINTS.length)],
    status,
    latency,
  };
}

function polyline(data: number[], max: number, w: number, h: number): string {
  if (data.length < 2) return '';
  const step = w / (MAX_POINTS - 1);
  return data.map((v, i) => {
    const x = i * step;
    const y = h - (v / (max || 1)) * h;
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
}

export default function ApiAccessTab() {
  const [apiKey, setApiKey] = useState('mshy_live_8F92a1C0dE9b883f3e2719f2a9B0e1C2d3');
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeCodeLang, setActiveCodeLang] = useState<'JS' | 'PY' | 'CURL'>('JS');

  const [metrics, setMetrics] = useState<MetricsPoint[]>([{ incoming: 12, completed: 8, failed: 1 }]);
  const [requestLog, setRequestLog] = useState<LogEntry[]>([]);
  const logIdRef = useRef(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics(prev => {
        const next = genPoint(prev[prev.length - 1]);
        return [...prev.slice(-MAX_POINTS + 1), next];
      });

      if (Math.random() > 0.35) {
        logIdRef.current += 1;
        setRequestLog(prev => [makeLogEntry(logIdRef.current), ...prev].slice(0, 50));
      }
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const latest = metrics[metrics.length - 1] || { incoming: 0, completed: 0, failed: 0 };
  const totalRequests = metrics.reduce((s, p) => s + p.incoming, 0);

  const incomingVals = metrics.map(p => p.incoming);
  const completedVals = metrics.map(p => p.completed);
  const failedVals = metrics.map(p => p.failed);
  const yMax = Math.max(20, ...incomingVals, ...completedVals, ...failedVals);

  const chartW = 400;
  const chartH = 100;
  const incomingPath = polyline(incomingVals, yMax, chartW, chartH);
  const completedPath = polyline(completedVals, yMax, chartW, chartH);
  const failedPath = polyline(failedVals, yMax, chartW, chartH);

  const handleCopyKey = () => {
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRegenerate = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = 'mshy_live_';
    for (let i = 0; i < 32; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setApiKey(result);
  };

  const codeSnippets = {
    JS: `// Initialize the AI 3D Studio Client
import { Studio3DClient } from '@studio3d/sdk';

const studio = new Studio3DClient({ 
  apiKey: '${apiKey}' 
});

// Generate a 3D model from prompt
const response = await studio.models.generate({
  prompt: 'Steampunk submarine, hyper-detailed brass, gears',
  quality: 'high',
  textureQuality: '4k',
  format: 'GLB'
});

console.log('Model generated successfully:', response.glbUrl);`,
    PY: `# Initialize the AI 3D Studio Python Client
from studio3d_sdk import Studio3DClient

studio = Studio3DClient(api_key='${apiKey}')

# Generate a 3D model from prompt
response = studio.models.generate(
    prompt='Steampunk submarine, hyper-detailed brass, gears',
    quality='high',
    texture_quality='4k',
    format='GLB'
)

print(f"Model generated: {response.glb_url}")`,
    CURL: `curl -X POST https://api.studio3d.ai/v1/generate \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "prompt": "Steampunk submarine, hyper-detailed brass, gears",
    "quality": "high",
    "texture_quality": "4k",
    "format": "GLB"
  }'`
  };

  const statBoxes: { label: string; value: number; color: string }[] = [
    { label: 'Incoming', value: latest.incoming, color: 'hsl(var(--primary))' },
    { label: 'Completed', value: latest.completed, color: 'hsl(142, 71%, 45%)' },
    { label: 'Failed', value: latest.failed, color: 'hsl(0, 84%, 60%)' },
  ];

  return (
    <div className="flex-1 min-h-0 p-4 flex flex-col lg:flex-row gap-4 animate-fadeIn text-[hsl(var(--foreground))] overflow-y-auto" id="api-access-tab-panel">
      {/* Left Column: API key and Usage Statistics */}
      <div className="flex-1 flex flex-col gap-5 min-w-0" id="api-left-panel">
        {/* Secret Key Panel */}
        <div className="card-minimal p-5 flex flex-col gap-4" id="api-key-box">
          <div>
            <h2 className="text-sm font-semibold text-[hsl(var(--foreground))] uppercase tracking-wider flex items-center gap-2">
              <Key size={16} className="text-[hsl(var(--muted-foreground))]" />
              Developer API Access Key
            </h2>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
              Use this secret credential to authenticate your custom applications and pipelines with our 3D synthesis APIs.
            </p>
          </div>

          <div className="flex items-center gap-3 bg-[hsl(var(--surface-2))] border border-[hsl(var(--border)/0.3)] rounded-xl p-3" id="api-key-input-wrapper">
            <span className="font-mono text-xs text-[hsl(var(--muted-foreground))] select-all flex-1 truncate">
              {showKey ? apiKey : '•••••••••••••••••••••••••••••••••••••••••••••••••'}
            </span>
            <div className="flex gap-2" id="key-actions">
              <button
                onClick={() => setShowKey(!showKey)}
                className="px-3 py-1.5 rounded-lg bg-[hsl(var(--surface-2))] border border-[hsl(var(--border)/0.3)] hover:bg-[hsl(var(--surface-3))] text-xs font-medium text-[hsl(var(--foreground))] transition-all"
                id="show-key-btn"
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
              <button
                onClick={handleCopyKey}
                className="p-1.5 rounded-lg bg-[hsl(var(--surface-2))] text-[hsl(var(--surface-0))] hover:brightness-110 transition-all flex items-center justify-center w-8 h-8"
                title="Copy API key to clipboard"
                id="copy-key-btn"
              >
                {copied ? <Check size={14} className="stroke-[3]" /> : <Copy size={14} />}
              </button>
            </div>
          </div>

          <div className="flex justify-between items-center" id="api-key-footer">
            <span className="text-[10px] text-[hsl(var(--muted-foreground))]">Created on Dec 15, 2025</span>
            <button
              onClick={handleRegenerate}
              className="text-xs font-medium text-[hsl(var(--foreground))] hover:underline"
              id="regenerate-key-btn"
            >
              Regenerate API Key
            </button>
          </div>
        </div>

        {/* API Usage & Analytics (Live SVG Chart) */}
        <div className="card-minimal p-5 flex flex-col gap-4" id="api-analytics-box">
          <div className="flex justify-between items-center flex-wrap gap-2" id="analytics-header">
            <div>
              <h3 className="text-sm font-semibold text-[hsl(var(--foreground))] flex items-center gap-2">
                <Activity size={16} className="text-[hsl(var(--muted-foreground))]" />
                Live API Traffic
              </h3>
              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">Real-time request flow, updating every 2s</p>
            </div>

            <div className="flex items-center gap-1.5 bg-[hsl(var(--surface-2))] border border-[hsl(var(--border)/0.3)] px-2.5 py-1 rounded-lg" id="analytics-active-calls">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-medium text-[hsl(var(--foreground))] uppercase font-mono">{totalRequests} Total Requests</span>
            </div>
          </div>

          {/* Stat boxes */}
          <div className="grid grid-cols-3 gap-3" id="analytics-stat-boxes">
            {statBoxes.map((s, i) => (
              <div key={i} className="flex flex-col items-center p-2 rounded-lg bg-[hsl(var(--surface-2))]/50 border border-[hsl(var(--border)/0.15)]">
                <span className="text-lg font-mono font-semibold" style={{ color: s.color }}>{s.value}</span>
                <span className="text-label">{s.label}</span>
              </div>
            ))}
          </div>

          {/* SVG Line Chart */}
          <div className="h-44 w-full bg-[hsl(var(--surface-2))]/40 rounded-xl border border-[hsl(var(--border)/0.15)] p-3 flex flex-col justify-end relative overflow-hidden" id="analytics-svg-chart-container">
            {/* Background grids */}
            <div className="absolute inset-x-0 top-1/4 h-[1px] bg-[hsl(var(--foreground)/0.02)]" />
            <div className="absolute inset-x-0 top-2/4 h-[1px] bg-[hsl(var(--foreground)/0.02)]" />
            <div className="absolute inset-x-0 top-3/4 h-[1px] bg-[hsl(var(--foreground)/0.02)]" />

            <svg className="w-full h-28 overflow-visible" viewBox={`0 0 ${chartW} ${chartH}`} preserveAspectRatio="none">
              <defs>
                <linearGradient id="grad-incoming" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.15" />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="grad-completed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(142, 71%, 45%)" stopOpacity="0.12" />
                  <stop offset="100%" stopColor="hsl(142, 71%, 45%)" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="grad-failed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(0, 84%, 60%)" stopOpacity="0.12" />
                  <stop offset="100%" stopColor="hsl(0, 84%, 60%)" stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* Area fills */}
              {incomingPath && (
                <path d={`${incomingPath} L ${chartW} ${chartH} L 0 ${chartH} Z`} fill="url(#grad-incoming)" />
              )}
              {completedPath && (
                <path d={`${completedPath} L ${chartW} ${chartH} L 0 ${chartH} Z`} fill="url(#grad-completed)" />
              )}
              {failedPath && (
                <path d={`${failedPath} L ${chartW} ${chartH} L 0 ${chartH} Z`} fill="url(#grad-failed)" />
              )}

              {/* Lines */}
              {incomingPath && (
                <path d={incomingPath} fill="none" stroke="hsl(var(--primary))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              )}
              {completedPath && (
                <path d={completedPath} fill="none" stroke="hsl(142, 71%, 45%)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              )}
              {failedPath && (
                <path d={failedPath} fill="none" stroke="hsl(0, 84%, 60%)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              )}
            </svg>

            {/* Legend */}
            <div className="flex justify-center items-center gap-4 mt-2 border-t border-[hsl(var(--border))]/[0.03] pt-2" id="chart-legend">
              {[
                { label: 'Incoming', color: 'bg-[hsl(var(--primary))]' },
                { label: 'Completed', color: 'bg-emerald-500' },
                { label: 'Failed', color: 'bg-red-500' },
              ].map((l, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${l.color}`} />
                  <span className="text-[9px] font-mono text-[hsl(var(--muted-foreground))]">{l.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Live Request Log */}
        <div className="card-minimal p-5 flex flex-col gap-3" id="api-request-log">
          <h3 className="text-sm font-semibold text-[hsl(var(--foreground))] flex items-center gap-2" id="request-log-header">
            <TrendingUp size={16} className="text-[hsl(var(--muted-foreground))]" />
            Request Log
          </h3>
          <div className="max-h-48 overflow-y-auto rounded-lg bg-[hsl(var(--surface-2))]/40 border border-[hsl(var(--border)/0.15)]" id="request-log-list">
            {requestLog.length === 0 && (
              <p className="text-[10px] text-[hsl(var(--muted-foreground))] p-3 text-center">Waiting for requests...</p>
            )}
            {requestLog.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center gap-3 px-3 py-2 border-b border-[hsl(var(--border))]/[0.05] last:border-b-0 text-[10px] font-mono"
              >
                <span className="text-[hsl(var(--muted-foreground))] w-16 flex-shrink-0">{entry.timestamp}</span>
                <span className="text-[hsl(var(--foreground))] flex-1 truncate">{entry.endpoint}</span>
                <span
                  className={`font-medium flex-shrink-0 ${entry.status === 200 ? 'text-emerald-500' : 'text-red-500'}`}
                >
                  {entry.status}
                </span>
                <span className="text-[hsl(var(--muted-foreground))] w-16 text-right flex-shrink-0">{entry.latency}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Column: Code Snippets & Rate Limits */}
      <div className="w-full lg:w-[420px] flex flex-col gap-5 flex-shrink-0" id="api-right-panel">
        {/* Rate limit widgets */}
        <div className="grid grid-cols-2 gap-4" id="api-metrics-grid">
          {[
            { label: 'Rate Limit', value: '150 req/min', icon: Server },
            { label: 'Concurrency', value: '5 Threads', icon: Cpu },
            { label: 'Avg Latency', value: `${latest.incoming > 0 ? Math.round(120 + Math.random() * 80) : 0}ms`, icon: Activity },
            { label: 'Error Rate', value: `${latest.incoming > 0 ? ((latest.failed / latest.incoming) * 100).toFixed(1) : '0.0'}%`, icon: TrendingUp },
          ].map((stat, i) => {
            const Icon = stat.icon;
            return (
              <div key={i} className="card-minimal p-3.5 flex items-center justify-between" id={`api-metric-item-${i}`}>
                <div className="flex flex-col gap-0.5">
                  <span className="text-label">{stat.label}</span>
                  <span className="text-sm font-mono font-medium text-[hsl(var(--foreground))]">{stat.value}</span>
                </div>
                <Icon size={16} className="text-[hsl(var(--muted-foreground))]" />
              </div>
            );
          })}
        </div>

        {/* Code snippet panel */}
        <div className="card-minimal p-5 flex flex-col gap-4 flex-1" id="api-playground">
          <div className="flex justify-between items-center" id="playground-header">
            <h3 className="text-xs font-medium text-[hsl(var(--foreground))] uppercase tracking-wider flex items-center gap-1.5">
              <Code size={14} className="text-[hsl(var(--muted-foreground))]" />
              Quick SDK Integration
            </h3>

            <div className="flex gap-1.5 bg-[hsl(var(--surface-2))] border border-[hsl(var(--border)/0.3)] p-0.5 rounded-lg" id="lang-switchers">
              {(['JS', 'PY', 'CURL'] as const).map((lang) => (
                <button
                  key={lang}
                  onClick={() => setActiveCodeLang(lang)}
                  className={`px-2 py-1 rounded text-[9px] font-mono font-medium transition-all ${
                    activeCodeLang === lang
                      ? 'bg-[hsl(var(--surface-2))] text-[hsl(var(--foreground))]'
                      : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
                  }`}
                  id={`code-lang-btn-${lang}`}
                >
                  {lang}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 relative bg-[hsl(var(--surface-2))] border border-[hsl(var(--border)/0.3)] rounded-xl p-3 overflow-hidden flex flex-col justify-between" id="playground-code-window">
            <pre className="text-[10px] font-mono text-[hsl(var(--muted-foreground))] leading-relaxed whitespace-pre-wrap overflow-y-auto max-h-[220px]">
              {codeSnippets[activeCodeLang]}
            </pre>

            <button
              onClick={() => {
                navigator.clipboard.writeText(codeSnippets[activeCodeLang]);
              }}
              className="absolute top-2.5 right-2.5 p-1.5 rounded-lg bg-[hsl(var(--surface-0))/0.6] hover:bg-black border border-[hsl(var(--border))]/[0.04] text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-all flex items-center justify-center"
              title="Copy code snippet"
              id="copy-snippet-btn"
            >
              <Copy size={12} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
