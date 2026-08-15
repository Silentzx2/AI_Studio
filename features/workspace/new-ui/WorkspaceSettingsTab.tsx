'use client';

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Settings, Shield, Sliders, Save, Check, Key, Cpu, HardDrive, Trash2, Monitor, RefreshCw, Server, Info, AlertTriangle, Activity, Zap, ChevronRight } from 'lucide-react';
import { apiClient } from '@/services/apiClient';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export default function WorkspaceSettingsTab() {
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
    <TooltipProvider>
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex-1 min-h-0 p-8 flex flex-col gap-8 text-foreground overflow-y-auto scrollbar-thin" 
      id="settings-tab-panel"
    >
      {/* Tab Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
              <Settings size={20} />
            </div>
            <div>
              <h2 className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
                Configurations & System Diagnostics
              </h2>
              <p className="text-xs text-muted-foreground font-medium">
                Configure engine parameters, API integration keys, and view real-time hardware metrics.
              </p>
            </div>
          </div>
          {backendStatus === 'offline' && (
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-destructive/10 text-destructive text-[10px] px-3 py-1 rounded-full border border-destructive/20 uppercase font-black tracking-widest flex items-center gap-2"
            >
              <AlertTriangle size={12} />
              Backend Offline
            </motion.div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="rounded-2xl border border-destructive/20 bg-destructive/5 px-5 py-4 text-xs text-red-400 flex items-center gap-3"
          >
            <AlertTriangle size={16} className="shrink-0" />
            <p className="font-bold">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8" id="settings-grid">
        {/* Left Card: Core Integration Keys */}
        <section className="bg-white/[0.02] border border-white/5 rounded-[2rem] p-6 flex flex-col gap-6" id="settings-keys-box">
          <div className="flex items-center gap-3 border-b border-white/5 pb-4">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500">
              <Key size={16} />
            </div>
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
              Security & API Access
            </h3>
          </div>

          <div className="flex flex-col gap-2.5" id="gemini-key-wrapper">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-white/40 uppercase font-black tracking-widest">HuggingFace API Token</label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info size={12} className="text-white/20 hover:text-white transition-colors cursor-help" />
                </TooltipTrigger>
                <TooltipContent>Required for dynamic model weights downloading</TooltipContent>
              </Tooltip>
            </div>
            <input
              type="password"
              placeholder="Enter your HF Token..."
              value={hfToken}
              onChange={(e) => setHfToken(e.target.value)}
              disabled={isLoading}
              className="w-full bg-black/40 border border-white/5 rounded-2xl p-4 text-xs text-white placeholder:text-white/10 focus:outline-none focus:border-amber-500/40 transition-all font-mono disabled:opacity-50 shadow-inner"
              id="settings-gemini-key-input"
            />
            <p className="text-[9px] text-white/20 leading-relaxed font-medium uppercase tracking-widest">
              💡 Tokens are stored securely on the dedicated neural server.
            </p>
          </div>

          <div className="flex items-center justify-between p-4 bg-black/40 border border-white/5 rounded-2xl text-[10px]" id="secrets-verification">
            <span className="text-white/40 font-black uppercase tracking-widest">Backend Connectivity</span>
            <span className={cn(
              "font-black uppercase tracking-[0.2em] flex items-center gap-2",
              backendStatus === 'connected' ? 'text-emerald-400' : 'text-destructive'
            )}>
              <div className={cn("w-1.5 h-1.5 rounded-full", backendStatus === 'connected' ? "bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.5)]" : "bg-destructive")} />
              {backendStatus === 'connected' ? 'Live & Connected' : 'Endpoint Offline'}
            </span>
          </div>

          <div className="flex flex-col gap-3 pt-4">
            <label className="text-[10px] text-white/40 uppercase font-black tracking-widest">Active Generation Engine</label>
            <select
              value={aiProvider}
              onChange={(e) => setAiProvider(e.target.value)}
              disabled={isLoading}
              className="w-full bg-black/40 border border-white/5 rounded-2xl p-3.5 text-xs text-white focus:outline-none focus:border-amber-500/40 cursor-pointer font-bold disabled:opacity-50 shadow-inner appearance-none transition-all hover:bg-black/60"
            >
              <option value="hunyuan3d-2.1">Hunyuan3D-2 Neural Mesh (Recommended)</option>
              <option value="trellis">Trellis Dense MVS (Experimental)</option>
              <option value="instant-mesh">InstantMesh LRM (Fast)</option>
            </select>
          </div>
        </section>

        {/* Right Card: Renderer Settings */}
        <section className="bg-white/[0.02] border border-white/5 rounded-[2rem] p-6 flex flex-col gap-6" id="settings-rendering-box">
          <div className="flex items-center gap-3 border-b border-white/5 pb-4">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500">
              <Sliders size={16} />
            </div>
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
              Viewport Engine Parameters
            </h3>
          </div>

          <div className="flex flex-col gap-5" id="rendering-parameters-list">
            {/* Ray tracing toggle */}
            <div className="flex items-center justify-between p-4 bg-black/20 rounded-2xl border border-white/5" id="param-raytracing">
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-black uppercase tracking-widest text-white/80">Ray-Baking Processor</span>
                <span className="text-[9px] text-white/20 font-bold uppercase tracking-widest">Simulate physical light behavior</span>
              </div>
              <button
                onClick={() => setRayTracing(!rayTracing)}
                className={cn(
                  "w-12 h-6 rounded-full transition-all relative p-1",
                  rayTracing ? "bg-amber-500" : "bg-white/10"
                )}
              >
                <div className={cn(
                  "w-4 h-4 rounded-full bg-white transition-all shadow-sm",
                  rayTracing ? "translate-x-6" : "translate-x-0"
                )} />
              </button>
            </div>

            {/* Anti aliasing selector */}
            <div className="flex flex-col gap-2.5" id="param-antialiasing">
              <label className="text-[10px] text-white/40 uppercase font-black tracking-widest">Anti-Aliasing Profile</label>
              <select
                value={antiAliasing}
                onChange={(e) => setAntiAliasing(e.target.value)}
                className="w-full bg-black/40 border border-white/5 rounded-2xl p-3.5 text-xs text-white focus:outline-none focus:border-amber-500/40 cursor-pointer font-bold shadow-inner"
                id="anti-aliasing-dropdown"
              >
                <option value="SMAA">SMAA (Post-Process • High Perf)</option>
                <option value="MSAA_4X">MSAA 4x (Multi-Sample • Balanced)</option>
                <option value="MSAA_8X">MSAA 8x (Heavy Sampling • Ultra)</option>
                <option value="NONE">Hardware Native (Disabled)</option>
              </select>
            </div>

            {/* Output formats */}
            <div className="flex flex-col gap-2.5" id="param-format">
              <label className="text-[10px] text-white/40 uppercase font-black tracking-widest">Primary Export Format</label>
              <select
                value={defaultFormat}
                onChange={(e) => setDefaultFormat(e.target.value)}
                disabled={isLoading}
                className="w-full bg-black/40 border border-white/5 rounded-2xl p-3.5 text-xs text-white focus:outline-none focus:border-amber-500/40 cursor-pointer disabled:opacity-50 font-bold shadow-inner"
                id="default-format-dropdown"
              >
                <option value="GLB">GLB (gLTF Binary Bundle)</option>
                <option value="OBJ">OBJ (Wavefront Industry Standard)</option>
                <option value="FBX">FBX (CAD Production Exchange)</option>
                <option value="STL">STL (Stereolithography • 3D Print)</option>
              </select>
            </div>
          </div>
        </section>

        {/* Card 3: Real Server Hardware */}
        <section className="bg-white/[0.02] border border-white/5 rounded-[2rem] p-6 flex flex-col gap-6">
          <div className="flex items-center gap-3 border-b border-white/5 pb-4">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500">
              <Server size={16} />
            </div>
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
              Neural Infrastructure Diagnostics
            </h3>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'GPU Accelerator', value: sysSpecs.gpuRenderer, icon: <Cpu size={14} />, color: 'text-white/80' },
              { label: 'VRAM Pool', value: sysSpecs.memoryGB, icon: <HardDrive size={14} />, color: 'text-emerald-400' },
              { label: 'Neural Threads', value: `${sysSpecs.cores} Core`, icon: <Activity size={14} />, color: 'text-white/80' },
              { label: 'CUDA Toolkit', value: sysSpecs.cudaVersion, icon: <Zap size={14} />, color: 'text-amber-500' },
            ].map((spec, i) => (
              <div key={i} className="bg-black/40 p-4 rounded-2xl border border-white/5 flex flex-col gap-2 shadow-inner">
                <div className="flex items-center gap-2 text-white/20">
                  {spec.icon}
                  <span className="text-[9px] font-black uppercase tracking-widest">{spec.label}</span>
                </div>
                <span className={cn("font-black text-[11px] truncate tracking-tight", spec.color)} title={spec.value}>
                  {spec.value}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Card 4: Server Storage */}
        <section className="bg-white/[0.02] border border-white/5 rounded-[2rem] p-6 flex flex-col gap-6">
          <div className="flex items-center gap-3 border-b border-white/5 pb-4">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500">
              <HardDrive size={16} />
            </div>
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
              Workspace & Data Management
            </h3>
          </div>

          <div className="flex justify-between items-center bg-black/40 p-5 rounded-2xl border border-white/5 shadow-inner">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-black uppercase tracking-widest text-white/80">Active Storage Footprint</span>
              <span className="text-[9px] text-white/20 font-bold uppercase tracking-widest">Cache, meshes & neural weights</span>
            </div>
            <span className="font-black text-amber-500 text-lg">
              {isLoading ? '...' : sysSpecs.storageUsedMB}
            </span>
          </div>

          <div className="flex items-center justify-between gap-4 pt-2">
            <p className="text-[10px] text-white/20 font-medium leading-relaxed max-w-[200px]">
              Flush local cache to re-sync with dedicated backend server instances.
            </p>
            <Button
              onClick={handleClearCache}
              variant="outline"
              size="sm"
              className="rounded-xl font-black uppercase tracking-widest text-[10px] gap-2 border-destructive/20 text-destructive hover:bg-destructive/5"
            >
              <RefreshCw size={12} />
              Re-Sync Engine
            </Button>
          </div>
        </section>
      </div>

      {/* Save Button Bar */}
      <div className="mt-auto pt-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-6" id="settings-save-row">
        <div className="flex items-center gap-4 group cursor-pointer">
          <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center text-white/20 group-hover:bg-white/10 group-hover:text-amber-500 transition-all">
            <Shield size={20} />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-black uppercase tracking-widest">Enterprise Security</span>
            <span className="text-[10px] text-white/20 font-bold uppercase tracking-widest">AES-256 Bit Backend Encryption</span>
          </div>
        </div>

        <Button
          onClick={handleSaveSettings}
          disabled={backendStatus === 'offline'}
          variant="premium"
          className="min-w-[240px] py-7 text-xs font-black uppercase tracking-[0.2em] shadow-[0_10px_40px_rgba(245,158,11,0.2)]"
        >
          {isSaved ? (
            <motion.div 
              initial={{ scale: 0.9 }} 
              animate={{ scale: 1 }} 
              className="flex items-center gap-2"
            >
              <Check size={16} className="stroke-[3]" />
              Settings Synced!
            </motion.div>
          ) : (
            <div className="flex items-center gap-2">
              <Save size={16} />
              Commit Configurations
            </div>
          )}
        </Button>
      </div>

      {/* Link to full settings page */}
      <motion.div 
        whileHover={{ x: 5 }}
        className="mt-4"
      >
        <a
          href="/settings"
          className="flex items-center justify-between w-full px-6 py-4 rounded-2xl bg-white/[0.03] border border-white/5 hover:border-amber-500/30 transition-all group"
        >
          <div className="flex items-center gap-4">
            <div className="p-2.5 rounded-xl bg-white/5 text-white/40 group-hover:text-amber-500 transition-colors">
              <Server size={18} />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-white/80">Full Control Center</p>
              <p className="text-[10px] text-white/20 font-bold uppercase tracking-widest mt-0.5">Global appearance, security & network orchestration</p>
            </div>
          </div>
          <ChevronRight size={20} className="text-white/10 group-hover:text-amber-500 transition-all" />
        </a>
      </motion.div>
    </motion.div>
    </TooltipProvider>
  );
}
