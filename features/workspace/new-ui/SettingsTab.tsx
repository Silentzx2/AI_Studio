'use client';

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Settings, Shield, Sliders, Save, Check, Key, Cpu, HardDrive, Trash2, Monitor, RefreshCw, Server } from 'lucide-react';
import { apiClient } from '@/services/apiClient';

export default function SettingsTab() {
  const [hfToken, setHfToken] = useState('');
  const [rayTracing, setRayTracing] = useState(true);
  const [antiAliasing, setAntiAliasing] = useState('SMAA');
  const [defaultFormat, setDefaultFormat] = useState('GLB');
  const [aiProvider, setAiProvider] = useState('hunyuan3d-2.1');
  const [autoSaveInterval, setAutoSaveInterval] = useState('30');
  const [isSaved, setIsSaved] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Real backend specifications
  const [sysSpecs, setSysSpecs] = useState<{
    gpuRenderer: string;
    cores: string | number;
    memoryGB: string;
    osPlatform: string;
    cudaVersion: string;
    storageUsedMB: string;
  }>({
    gpuRenderer: 'Detecting...',
    cores: 'Detecting...',
    memoryGB: 'Detecting...',
    osPlatform: 'Detecting...',
    cudaVersion: 'Detecting...',
    storageUsedMB: 'Detecting...',
  });

  const [backendStatus, setBackendStatus] = useState<'connected' | 'offline'>('connected');

  const fetchBackendData = async () => {
    setIsLoading(true);
    let failedCount = 0;

    // 1. Fetch HF Token & Provider
    try {
      const settingsRes = await apiClient.get<{ data: any }>('/api/v1/admin/settings');
      const settingsPayload = settingsRes?.data ?? settingsRes ?? {};
      setAiProvider(settingsPayload.ai_provider || settingsPayload.default_provider || 'hunyuan3d-2.1');
      try {
        const tokenRes = await apiClient.get<{ data: { configured?: boolean; valid?: boolean } }>('/api/v1/admin/settings/hf-token');
        if (tokenRes?.data?.configured && tokenRes?.data?.valid) {
          setHfToken('••••••••');
        }
      } catch (e) {
        failedCount++;
      }
    } catch (e) {
      failedCount++;
    }

    // 2. Fetch System Info (CPU/OS)
    let cores = 'N/A';
    let osPlatform = 'N/A';
    try {
      const sysRes = await apiClient.get<{ data: any }>('/api/v1/system/info');
      const sys = sysRes?.data ?? sysRes ?? {};
      if (sys.cpu?.logical_count) cores = sys.cpu.logical_count;
      if (sys.os) osPlatform = `${sys.os.system} ${sys.os.machine}`;
    } catch (e) {
      failedCount++;
    }

    // 3. Fetch GPU Info
    let gpuRenderer = 'No GPU Detected';
    let memoryGB = 'N/A';
    let cudaVersion = 'N/A';
    try {
      const gpuRes = await apiClient.get<{ data: any }>('/api/v1/system/gpu');
      const gpuPayload = gpuRes?.data ?? gpuRes ?? {};
      const gpuInfo = gpuPayload.gpu || gpuPayload.gpu_info || gpuPayload;
      const devices = gpuInfo.devices || gpuInfo.gpus || [];
      if (gpuInfo.available && devices.length > 0) {
        const gpu = devices[0];
        gpuRenderer = gpu.name || gpu.model || 'Unknown GPU';
        const totalMb = gpu.vram_mb ?? gpu.memory_total ?? gpu.memory_total_mb;
        memoryGB = totalMb ? (totalMb / 1024).toFixed(1) + ' GB' : 'N/A';
      }
      const cudaInfo = gpuPayload.cuda || gpuInfo.cuda || {};
      if (cudaInfo.available) {
        cudaVersion = `CUDA ${cudaInfo.version || cudaInfo.cuda_version || cudaInfo.cuda}`;
      }
    } catch (e) {
      failedCount++;
    }

    // 4. Fetch Storage Info
    let storageUsedMB = 'N/A';
    try {
      const storageRes = await apiClient.get<{ data: any }>('/api/v1/system/storage');
      const storagePayload = storageRes?.data ?? storageRes ?? {};
      const usedGb = storagePayload.used_gb ?? storagePayload.total_used_gb;
      if (usedGb !== undefined) {
        storageUsedMB = (Number(usedGb) * 1024).toFixed(2) + ' MB';
      }
    } catch (e) {
      failedCount++;
    }

    // 5. Fetch Runtime Config
    try {
      const optionsRes = await apiClient.get<{ data: any }>('/api/v1/runtime/options');
      const optionsPayload = optionsRes?.data ?? optionsRes ?? {};
      const outputFormats = optionsPayload.output_formats || [];
      if (outputFormats.length > 0) {
        setDefaultFormat(String(outputFormats[0].id || outputFormats[0].label || outputFormats[0]).toUpperCase());
      }
    } catch (e) {
      failedCount++;
    }

    setSysSpecs({
      gpuRenderer,
      cores,
      memoryGB,
      osPlatform,
      cudaVersion,
      storageUsedMB
    });

    // Only mark offline if 4+ endpoints failed (allow 1 failure)
    if (failedCount >= 4) {
      setBackendStatus('offline');
      setError('Backend partially unavailable');
    } else {
      setBackendStatus('connected');
      setError(null);
    }

    setIsLoading(false);
  };

  useEffect(() => {
    // Load local-only UI settings
    if (typeof window !== 'undefined') {
      const savedRay = localStorage.getItem('SETTINGS_RAY_TRACING');
      const savedAA = localStorage.getItem('SETTINGS_ANTI_ALIASING') || 'SMAA';
      const savedInterval = localStorage.getItem('SETTINGS_AUTOSAVE_INTERVAL') || '30';

      setTimeout(() => {
        if (savedRay !== null) setRayTracing(savedRay === 'true');
        setAntiAliasing(savedAA);
        setAutoSaveInterval(savedInterval);
      }, 0);
    }

    // Fetch real backend settings & specs
    setTimeout(() => {
      fetchBackendData();
    }, 0);
  }, []);

  const handleSaveSettings = async () => {
    // Save UI local settings
    if (typeof window !== 'undefined') {
      localStorage.setItem('SETTINGS_RAY_TRACING', String(rayTracing));
      localStorage.setItem('SETTINGS_ANTI_ALIASING', antiAliasing);
      localStorage.setItem('SETTINGS_AUTOSAVE_INTERVAL', autoSaveInterval);
    }

    try {
      // Post HF token to backend
      if (hfToken) {
        await apiClient.post('/api/v1/admin/settings/hf-token', { token: hfToken });
      }
      
      // Update config for output format
      await apiClient.post('/api/v1/runtime/config', {
        output_format: defaultFormat.toLowerCase()
      });

      // Update AI provider
      await apiClient.post('/api/v1/admin/providers/switch', {
        provider: aiProvider
      });

      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2500);
    } catch (err) {
      alert(`Failed to save backend settings: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleClearCache = async () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('SETTINGS_RAY_TRACING');
      localStorage.removeItem('SETTINGS_ANTI_ALIASING');
      localStorage.removeItem('SETTINGS_AUTOSAVE_INTERVAL');
    }
    try {
      await fetchBackendData();
      alert('Local cache cleared and synced with backend.');
    } catch (e) {}
  };

  return (
    <div className="flex-1 p-6 flex flex-col gap-6 animate-fadeIn text-[hsl(var(--foreground))]" id="settings-tab-panel">
      {/* Tab Header */}
      <div>
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-[hsl(var(--foreground))] flex items-center gap-2">
            <Settings size={20} className="text-[hsl(var(--neon-amber))]" />
            Platform Configurations & Real System Diagnostics
          </h2>
          {backendStatus === 'offline' && (
            <span className="bg-[hsl(var(--destructive)/0.2)] text-[hsl(var(--destructive))] text-[10px] px-2 py-0.5 rounded border border-[hsl(var(--destructive))]/30 uppercase font-bold tracking-wider">
              Backend Offline
            </span>
          )}
        </div>
        <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
          Configure default output formats, renderer parameters, and secure API integration keys.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-[hsl(var(--destructive))]/30 bg-[hsl(var(--destructive)/0.1)] px-4 py-3 text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" id="settings-grid">
        {/* Left Card: Core Integration Keys */}
        <div className="bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] rounded-2xl p-5 flex flex-col gap-5" id="settings-keys-box">
          <h3 className="text-xs font-bold text-[hsl(var(--foreground))] uppercase tracking-wider flex items-center gap-2">
            <Key size={14} className="text-[hsl(var(--neon-amber))]" />
            Secure API Secrets Configuration
          </h3>

          <div className="flex flex-col gap-2" id="gemini-key-wrapper">
            <label className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase font-mono font-bold">HuggingFace API Token</label>
            <input
              type="password"
              placeholder="Enter your HF Token..."
              value={hfToken}
              onChange={(e) => setHfToken(e.target.value)}
              disabled={isLoading}
              className="w-full bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] rounded-xl p-3 text-xs text-[hsl(var(--foreground))] placeholder-[hsl(var(--muted-foreground))] focus:outline-none focus:border-[hsl(var(--neon-amber))] transition-all font-mono disabled:opacity-50"
              id="settings-gemini-key-input"
            />
            <p className="text-[10px] text-[hsl(var(--muted-foreground))] leading-relaxed">
              💡 Required for downloading models dynamically from the Hugging Face hub. Kept secure on backend.
            </p>
          </div>

          <div className="flex items-center justify-between p-3 bg-[hsl(var(--foreground)/0.02)] border border-[hsl(var(--foreground)/0.04)] rounded-xl text-[11px]" id="secrets-verification">
            <span className="text-[hsl(var(--muted-foreground))]">Backend Sync Status:</span>
            <span className={`font-mono font-bold flex items-center gap-1.5 ${backendStatus === 'connected' ? 'text-[hsl(var(--neon-green))]' : 'text-[hsl(var(--destructive))]'}`}>
              <Check size={12} className="stroke-[3]" />
              {backendStatus === 'connected' ? 'Connected to API' : 'Disconnected'}
            </span>
          </div>

          <div className="flex flex-col gap-2 pt-2 border-t border-[hsl(var(--border))]">
            <label className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase font-mono font-bold">Default AI Generation Engine</label>
            <select
              value={aiProvider}
              onChange={(e) => setAiProvider(e.target.value)}
              disabled={isLoading}
              className="w-full bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] rounded-xl p-2.5 text-xs text-[hsl(var(--foreground))] focus:outline-none focus:border-[hsl(var(--neon-amber))] cursor-pointer font-mono disabled:opacity-50"
            >
              <option value="hunyuan3d-2.1">Hunyuan3D-2 Neural Mesh</option>
              <option value="trellis">Trellis Dense MVS</option>
              <option value="instant-mesh">InstantMesh LRM</option>
              <option value="triposr">TripoSR v2</option>
            </select>
          </div>
        </div>

        {/* Right Card: Renderer Settings */}
        <div className="bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] rounded-2xl p-5 flex flex-col gap-5" id="settings-rendering-box">
          <h3 className="text-xs font-bold text-[hsl(var(--foreground))] uppercase tracking-wider flex items-center gap-2">
            <Sliders size={14} className="text-[hsl(var(--neon-amber))]" />
            Viewport & Export Parameters
          </h3>

          <div className="flex flex-col gap-4" id="rendering-parameters-list">
            {/* Ray tracing toggle */}
            <div className="flex items-center justify-between" id="param-raytracing">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-bold text-[hsl(var(--foreground))]">Post-Process Ray-Baking</span>
                <span className="text-[10px] text-[hsl(var(--muted-foreground))]">Calculates physical ray bounces for shadows</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={rayTracing}
                  onChange={(e) => setRayTracing(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-[hsl(var(--muted-foreground))] after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[hsl(var(--neon-amber))] peer-checked:after:bg-black" />
              </label>
            </div>

            {/* Anti aliasing selector */}
            <div className="flex flex-col gap-1.5" id="param-antialiasing">
              <label className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase font-mono font-bold">Anti-Aliasing Quality Profile</label>
              <select
                value={antiAliasing}
                onChange={(e) => setAntiAliasing(e.target.value)}
                className="w-full bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] rounded-xl p-2.5 text-xs text-[hsl(var(--foreground))] focus:outline-none focus:border-[hsl(var(--neon-amber))] cursor-pointer"
                id="anti-aliasing-dropdown"
              >
                <option value="SMAA">SMAA (Post-Process, Fast)</option>
                <option value="MSAA_4X">MSAA 4x (Multi-Sample, Balanced)</option>
                <option value="MSAA_8X">MSAA 8x (Heavy sampling, High-End GPU)</option>
                <option value="NONE">Disabled</option>
              </select>
            </div>

            {/* Output formats */}
            <div className="flex flex-col gap-1.5" id="param-format">
              <label className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase font-mono font-bold">Backend Export Format</label>
              <select
                value={defaultFormat}
                onChange={(e) => setDefaultFormat(e.target.value)}
                disabled={isLoading}
                className="w-full bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] rounded-xl p-2.5 text-xs text-[hsl(var(--foreground))] focus:outline-none focus:border-[hsl(var(--neon-amber))] cursor-pointer disabled:opacity-50"
                id="default-format-dropdown"
              >
                <option value="GLB">GLB (gLTF Binary Assembly)</option>
                <option value="OBJ">OBJ (Wavefront Mesh / MTL)</option>
                <option value="FBX">FBX (Autodesk CAD Interop)</option>
                <option value="STL">STL (3D Print Ready Geometry)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Card 3: Real Server Hardware */}
        <div className="bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] rounded-2xl p-5 flex flex-col gap-4">
          <h3 className="text-xs font-bold text-[hsl(var(--foreground))] uppercase tracking-wider flex items-center gap-2">
            <Server size={14} className="text-[hsl(var(--neon-amber))]" />
            Backend Hardware & Runtime Specs
          </h3>

          <div className="grid grid-cols-2 gap-3 text-xs font-mono">
            <div className="bg-[hsl(var(--surface-2))] p-3 rounded-xl border border-[hsl(var(--border))] flex flex-col gap-1">
              <span className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase">GPU Accelerator</span>
              <span className="font-bold text-[hsl(var(--foreground))] text-[11px] truncate" title={sysSpecs.gpuRenderer}>
                {sysSpecs.gpuRenderer}
              </span>
            </div>

            <div className="bg-[hsl(var(--surface-2))] p-3 rounded-xl border border-[hsl(var(--border))] flex flex-col gap-1">
              <span className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase">GPU Memory</span>
              <span className="font-bold text-[hsl(var(--neon-green))] text-sm">
                {sysSpecs.memoryGB}
              </span>
            </div>

            <div className="bg-[hsl(var(--surface-2))] p-3 rounded-xl border border-[hsl(var(--border))] flex flex-col gap-1">
              <span className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase">CPU Cores</span>
              <span className="font-bold text-[hsl(var(--foreground))] text-[11px]">
                {sysSpecs.cores} Threads
              </span>
            </div>

            <div className="bg-[hsl(var(--surface-2))] p-3 rounded-xl border border-[hsl(var(--border))] flex flex-col gap-1">
              <span className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase">CUDA Toolkit</span>
              <span className="font-bold text-[hsl(var(--neon-amber))] text-xs">
                {sysSpecs.cudaVersion}
              </span>
            </div>
          </div>
        </div>

        {/* Card 4: Server Storage */}
        <div className="bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] rounded-2xl p-5 flex flex-col gap-4">
          <h3 className="text-xs font-bold text-[hsl(var(--foreground))] uppercase tracking-wider flex items-center gap-2">
            <HardDrive size={14} className="text-[hsl(var(--neon-amber))]" />
            Backend Storage & Workspace
          </h3>

          <div className="flex justify-between items-center bg-[hsl(var(--surface-2))] p-3 rounded-xl border border-[hsl(var(--border))] text-xs">
            <div className="flex flex-col gap-0.5">
              <span className="font-bold text-[hsl(var(--foreground))]">Server Storage Usage</span>
              <span className="text-[10px] text-[hsl(var(--muted-foreground))]">Models, thumbnails & generated meshes</span>
            </div>
            <span className="font-mono font-bold text-[hsl(var(--neon-amber))]">
              {isLoading ? '...' : sysSpecs.storageUsedMB}
            </span>
          </div>

          <div className="flex items-center justify-between gap-3 pt-2">
            <span className="text-[11px] text-[hsl(var(--muted-foreground))]">Sync with backend and clear local viewport preferences:</span>
            <button
              onClick={handleClearCache}
              className="px-3 py-2 rounded-xl bg-[hsl(var(--destructive)/0.1)] hover:bg-[hsl(var(--destructive)/0.2)] border border-[hsl(var(--destructive))]/30 text-[hsl(var(--destructive))] font-bold text-xs flex items-center gap-1.5 transition-all shrink-0"
            >
              <RefreshCw size={13} />
              Re-Sync Settings
            </button>
          </div>
        </div>

      </div>

      {/* Save Button Bar */}
      <div className="mt-4 flex justify-end" id="settings-save-row">
        <button
          onClick={handleSaveSettings}
          disabled={backendStatus === 'offline'}
          className="px-6 py-3 rounded-xl bg-gradient-to-r from-[hsl(var(--neon-amber))] to-[hsl(var(--neon-amber))] text-[hsl(var(--surface-0))] font-extrabold text-xs flex items-center gap-2 hover:brightness-110 transition-all shadow-[0_4px_16px_rgba(255,90,31,0.25)] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          id="settings-save-btn"
        >
          {isSaved ? (
            <>
              <Check size={14} className="stroke-[3]" />
              Configurations Saved & Applied!
            </>
          ) : (
            <>
              <Save size={14} />
              Save Configurations
            </>
          )}
        </button>
      </div>
      {/* Link to full settings page */}
      <div className="mt-6 pt-4 border-t border-[hsl(var(--border))]">
        <a
          href="/settings"
          className="flex items-center justify-between w-full px-4 py-3 rounded-xl bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]/40 transition-colors group"
        >
          <div>
            <p className="text-xs font-bold text-[hsl(var(--foreground))]">Full Settings Panel</p>
            <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-0.5">Appearance, network, security, advanced options</p>
          </div>
          <Server size={16} className="text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--primary))] transition-colors flex-shrink-0" />
        </a>
      </div>
    </div>
  );
}
