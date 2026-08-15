"use client";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Code, Copy, Check, Key, TrendingUp, Cpu, Server, Activity } from 'lucide-react';

export default function ApiAccessTab() {
  const [apiKey, setApiKey] = useState('mshy_live_8F92a1C0dE9b883f3e2719f2a9B0e1C2d3');
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeCodeLang, setActiveCodeLang] = useState<'JS' | 'PY' | 'CURL'>('JS');

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

        {/* API Usage & Analytics (Custom SVG Chart) */}
        <div className="card-minimal p-5 flex flex-col gap-4" id="api-analytics-box">
          <div className="flex justify-between items-center flex-wrap gap-2" id="analytics-header">
            <div>
              <h3 className="text-sm font-semibold text-[hsl(var(--foreground))] flex items-center gap-2">
                <Activity size={16} className="text-[hsl(var(--muted-foreground))]" />
                API Generation Volume
              </h3>
              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">Synthesized mesh API calls over the last 7 days</p>
            </div>

            <div className="flex items-center gap-1.5 bg-[hsl(var(--surface-2))] border border-[hsl(var(--border)/0.3)] px-2.5 py-1 rounded-lg" id="analytics-active-calls">
              <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--muted-foreground))]" />
              <span className="text-[10px] font-medium text-[hsl(var(--foreground))] uppercase font-mono">152 Total Requests</span>
            </div>
          </div>

          {/* SVG Line Chart */}
          <div className="h-44 w-full bg-[hsl(var(--surface-2))]/40 rounded-xl border border-[hsl(var(--border)/0.15)] p-3 flex flex-col justify-end relative overflow-hidden" id="analytics-svg-chart-container">
            {/* Background grids */}
            <div className="absolute inset-x-0 top-1/4 h-[1px] bg-[hsl(var(--foreground)/0.02)]" />
            <div className="absolute inset-x-0 top-2/4 h-[1px] bg-[hsl(var(--foreground)/0.02)]" />
            <div className="absolute inset-x-0 top-3/4 h-[1px] bg-[hsl(var(--foreground)/0.02)]" />

            <svg className="w-full h-28 overflow-visible" viewBox="0 0 400 100" preserveAspectRatio="none">
              {/* Gradient def */}
              <defs>
                <linearGradient id="chart-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--muted-foreground))" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="hsl(var(--muted-foreground))" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Area path */}
              <path
                d="M 10 90 L 70 82 L 130 50 L 190 62 L 250 25 L 310 40 L 370 12 L 370 100 L 10 100 Z"
                fill="url(#chart-grad)"
              />

              {/* Line path */}
              <path
                d="M 10 90 L 70 82 L 130 50 L 190 62 L 250 25 L 310 40 L 370 12"
                fill="none"
                stroke="hsl(var(--muted-foreground))"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Active marker node */}
              <circle cx="370" cy="12" r="5" fill="hsl(var(--muted-foreground))" stroke="hsl(var(--foreground))" strokeWidth="1.5" />
            </svg>

            {/* X Axis labels */}
            <div className="flex justify-between items-center text-[9px] font-mono text-[hsl(var(--muted-foreground))] mt-2 border-t border-[hsl(var(--border))]/[0.03] pt-2" id="chart-x-axis">
              <span>Mon</span>
              <span>Tue</span>
              <span>Wed</span>
              <span>Thu</span>
              <span>Fri</span>
              <span>Sat</span>
              <span>Sun</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Column: Code Snippets & Rate Limits */}
      <div className="w-full lg:w-[420px] flex flex-col gap-5 flex-shrink-0" id="api-right-panel">
        {/* Rate limit widgets */}
        <div className="grid grid-cols-2 gap-4" id="api-metrics-grid">
          {[
            { label: 'Active Rate Limit', value: '150 req/min', icon: Server },
            { label: 'Active Threads', value: '5 Concur.', icon: Cpu },
          ].map((stat, i) => {
            const Icon = stat.icon;
            return (
              <div key={i} className="card-minimal p-3.5 flex items-center justify-between" id={`api-metric-item-${i}`}>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-[hsl(var(--muted-foreground))] font-medium uppercase tracking-wider">{stat.label}</span>
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
