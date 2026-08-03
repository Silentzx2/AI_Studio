'use client';

import React, { useState, useEffect } from 'react';
import { Settings, Shield, Sliders, Save, Check, Key, Cpu, HardDrive, Trash2, Monitor, RefreshCw, Server, Palette } from 'lucide-react';
import { apiClient } from '@/services/apiClient';
import { AppearanceSection } from '@/features/settings/sections/AppearanceSection';

export default function SettingsTab() {
  const [activeSection, setActiveSection] = useState<'platform' | 'appearance'>('platform');
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
    <div className="flex-1 flex flex-col text-[#FAFAFA] overflow-hidden" id="settings-tab-panel">
      {/* Section Switcher */}
      <div className="flex items-center gap-1 px-6 pt-6 pb-4">
        <button
          onClick={() => setActiveSection('platform')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
            activeSection === 'platform'
              ? 'text-[#F5A623] bg-[#F5A623]/5 border-[#F5A623]/25'
              : 'text-[#A1A1AA] hover:text-white bg-transparent border-transparent hover:bg-white/[0.02]'
          }`}
        >
          <Settings size={14} className={activeSection === 'platform' ? 'text-[#F5A623]' : 'text-[#71717A]'} />
          Platform Settings
        </button>
        <button
          onClick={() => setActiveSection('appearance')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
            activeSection === 'appearance'
              ? 'text-[#F5A623] bg-[#F5A623]/5 border-[#F5A623]/25'
              : 'text-[#A1A1AA] hover:text-white bg-transparent border-transparent hover:bg-white/[0.02]'
          }`}
        >
          <Palette size={14} className={activeSection === 'appearance' ? 'text-[#F5A623]' : 'text-[#71717A]'} />
          Theme Manager
        </button>
      </div>

      {activeSection === 'appearance' ? (
        <div className="flex-1 overflow-y-auto">
          <AppearanceSection />
        </div>
      ) : (
        <div className="flex-1 p-6 pb-0 flex flex-col gap-6 animate-fadeIn overflow-y-auto">
      {/* Tab Header */}
      <div>
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Settings size={20} className="text-[#FF5A1F]" />
            Platform Configurations & Real System Diagnostics
          </h2>
          {backendStatus === 'offline' && (
            <span className="bg-red-500/20 text-red-400 text-[10px] px-2 py-0.5 rounded border border-red-500/30 uppercase font-bold tracking-wider">
              Backend Offline
            </span>
          )}
        </div>
        <p className="text-xs text-[#71717A] mt-1">
          Configure default output formats, renderer parameters, and secure API integration keys.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" id="settings-grid">
        {/* Left Card: Core Integration Keys */}
        <div className="bg-[#111116] border border-[#1E1E26] rounded-2xl p-5 flex flex-col gap-5" id="settings-keys-box">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Key size={14} className="text-[#FF5A1F]" />
            Secure API Secrets Configuration
          </h3>

          <div className="flex flex-col gap-2" id="gemini-key-wrapper">
            <label className="text-[10px] text-[#A1A1AA] uppercase font-mono font-bold">HuggingFace API Token</label>
            <input
              type="password"
              placeholder="Enter your HF Token..."
              value={hfToken}
              onChange={(e) => setHfToken(e.target.value)}
              disabled={isLoading}
              className="w-full bg-[#18181F] border border-[#27272A] rounded-xl p-3 text-xs text-white placeholder-[#52525B] focus:outline-none focus:border-[#FF5A1F] transition-all font-mono disabled:opacity-50"
              id="settings-gemini-key-input"
            />
            <p className="text-[10px] text-[#71717A] leading-relaxed">
              💡 Required for downloading models dynamically from the Hugging Face hub. Kept secure on backend.
            </p>
          </div>

          <div className="flex items-center justify-between p-3 bg-white/[0.02] border border-white/[0.04] rounded-xl text-[11px]" id="secrets-verification">
            <span className="text-[#A1A1AA]">Backend Sync Status:</span>
            <span className={`font-mono font-bold flex items-center gap-1.5 ${backendStatus === 'connected' ? 'text-emerald-400' : 'text-red-400'}`}>
              <Check size={12} className="stroke-[3]" />
              {backendStatus === 'connected' ? 'Connected to API' : 'Disconnected'}
            </span>
          </div>

          <div className="flex flex-col gap-2 pt-2 border-t border-[#1E1E26]">
            <label className="text-[10px] text-[#A1A1AA] uppercase font-mono font-bold">Default AI Generation Engine</label>
            <select
              value={aiProvider}
              onChange={(e) => setAiProvider(e.target.value)}
              disabled={isLoading}
              className="w-full bg-[#18181F] border border-[#27272A] rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-[#FF5A1F] cursor-pointer font-mono disabled:opacity-50"
            >
              <option value="hunyuan3d-2.1">Hunyuan3D-2 Neural Mesh</option>
              <option value="trellis">Trellis Dense MVS</option>
              <option value="instant-mesh">InstantMesh LRM</option>
              <option value="triposr">TripoSR v2</option>
            </select>
          </div>
        </div>

        {/* Right Card: Renderer Settings */}
        <div className="bg-[#111116] border border-[#1E1E26] rounded-2xl p-5 flex flex-col gap-5" id="settings-rendering-box">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Sliders size={14} className="text-[#FF5A1F]" />
            Viewport & Export Parameters
          </h3>

          <div className="flex flex-col gap-4" id="rendering-parameters-list">
            {/* Ray tracing toggle */}
            <div className="flex items-center justify-between" id="param-raytracing">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-bold text-white">Post-Process Ray-Baking</span>
                <span className="text-[10px] text-[#71717A]">Calculates physical ray bounces for shadows</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={rayTracing}
                  onChange={(e) => setRayTracing(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-[#18181F] border border-[#27272A] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-[#71717A] after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#FF5A1F] peer-checked:after:bg-black" />
              </label>
            </div>

            {/* Anti aliasing selector */}
            <div className="flex flex-col gap-1.5" id="param-antialiasing">
              <label className="text-[10px] text-[#A1A1AA] uppercase font-mono font-bold">Anti-Aliasing Quality Profile</label>
              <select
                value={antiAliasing}
                onChange={(e) => setAntiAliasing(e.target.value)}
                className="w-full bg-[#18181F] border border-[#27272A] rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-[#FF5A1F] cursor-pointer"
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
              <label className="text-[10px] text-[#A1A1AA] uppercase font-mono font-bold">Backend Export Format</label>
              <select
                value={defaultFormat}
                onChange={(e) => setDefaultFormat(e.target.value)}
                disabled={isLoading}
                className="w-full bg-[#18181F] border border-[#27272A] rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-[#FF5A1F] cursor-pointer disabled:opacity-50"
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
        <div className="bg-[#111116] border border-[#1E1E26] rounded-2xl p-5 flex flex-col gap-4">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Server size={14} className="text-[#FF5A1F]" />
            Backend Hardware & Runtime Specs
          </h3>

          <div className="grid grid-cols-2 gap-3 text-xs font-mono">
            <div className="bg-[#18181F] p-3 rounded-xl border border-[#27272A] flex flex-col gap-1">
              <span className="text-[10px] text-[#71717A] uppercase">GPU Accelerator</span>
              <span className="font-bold text-white text-[11px] truncate" title={sysSpecs.gpuRenderer}>
                {sysSpecs.gpuRenderer}
              </span>
            </div>

            <div className="bg-[#18181F] p-3 rounded-xl border border-[#27272A] flex flex-col gap-1">
              <span className="text-[10px] text-[#71717A] uppercase">GPU Memory</span>
              <span className="font-bold text-emerald-400 text-sm">
                {sysSpecs.memoryGB}
              </span>
            </div>

            <div className="bg-[#18181F] p-3 rounded-xl border border-[#27272A] flex flex-col gap-1">
              <span className="text-[10px] text-[#71717A] uppercase">CPU Cores</span>
              <span className="font-bold text-white text-[11px]">
                {sysSpecs.cores} Threads
              </span>
            </div>

            <div className="bg-[#18181F] p-3 rounded-xl border border-[#27272A] flex flex-col gap-1">
              <span className="text-[10px] text-[#71717A] uppercase">CUDA Toolkit</span>
              <span className="font-bold text-amber-400 text-xs">
                {sysSpecs.cudaVersion}
              </span>
            </div>
          </div>
        </div>

        {/* Card 4: Server Storage */}
        <div className="bg-[#111116] border border-[#1E1E26] rounded-2xl p-5 flex flex-col gap-4">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <HardDrive size={14} className="text-[#FF5A1F]" />
            Backend Storage & Workspace
          </h3>

          <div className="flex justify-between items-center bg-[#18181F] p-3 rounded-xl border border-[#27272A] text-xs">
            <div className="flex flex-col gap-0.5">
              <span className="font-bold text-white">Server Storage Usage</span>
              <span className="text-[10px] text-[#71717A]">Models, thumbnails & generated meshes</span>
            </div>
            <span className="font-mono font-bold text-[#FF5A1F]">
              {isLoading ? '...' : sysSpecs.storageUsedMB}
            </span>
          </div>

          <div className="flex items-center justify-between gap-3 pt-2">
            <span className="text-[11px] text-[#71717A]">Sync with backend and clear local viewport preferences:</span>
            <button
              onClick={handleClearCache}
              className="px-3 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 font-bold text-xs flex items-center gap-1.5 transition-all shrink-0"
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
          className="px-6 py-3 rounded-xl bg-gradient-to-r from-[#FF5A1F] to-[#FF8A00] text-black font-extrabold text-xs flex items-center gap-2 hover:brightness-110 transition-all shadow-[0_4px_16px_rgba(255,90,31,0.25)] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
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
      <div className="mt-6 pt-4 border-t border-[#1E1E26]">
        <a
          href="/settings"
          className="flex items-center justify-between w-full px-4 py-3 rounded-xl bg-[#18181F] border border-[#27272A] hover:border-[#F5A623]/40 transition-colors group"
        >
          <div>
            <p className="text-xs font-bold text-white">Full Settings Panel</p>
            <p className="text-[10px] text-[#71717A] mt-0.5">Appearance, network, security, advanced options</p>
          </div>
          <Server size={16} className="text-[#71717A] group-hover:text-[#F5A623] transition-colors flex-shrink-0" />
        </a>
      </div>
    </div>
      )}
    </div>
  );
}
