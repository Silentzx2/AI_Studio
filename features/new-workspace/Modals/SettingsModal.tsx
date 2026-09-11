import React, { useState, useEffect } from 'react';
import { 
  Server, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw,
  Wrench
} from 'lucide-react';
import { useWorkspace } from '../store/WorkspaceContext';
import { apiClient } from '../lib/api';

export const SettingsModal: React.FC = () => {
  const {
    isSettingsOpen,
    setIsSettingsOpen,
    systemStats,
    refreshSystemStats,
    generationSettings,
    setGenerationSettings
  } = useWorkspace();

  useEffect(() => {
    if (!isSettingsOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsSettingsOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isSettingsOpen, setIsSettingsOpen]);

  const [host, setHost] = useState(() => {
    // Load saved host from localStorage or use default
    try { return localStorage.getItem('ai3d_api_host') || apiClient.getBaseUrl(); } catch { return apiClient.getBaseUrl(); }
  });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; msg: string } | null>(null);
  const nodeCount = systemStats.status === 'online' ? 1 : 0;
  const nodeError = systemStats.status === 'offline' ? 'Backend is offline' : null;

  if (!isSettingsOpen) return null;

  const handleSave = () => {
    // Persist host URL to localStorage and update apiClient
    try { localStorage.setItem('ai3d_api_host', host); } catch { /* ignore */ }
    apiClient.setBaseUrl(host);
    setIsSettingsOpen(false);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    const stats = await apiClient.getSystemStats();
    setTesting(false);
    if (stats.status === 'online') {
      setTestResult({ success: true, msg: 'Connected to AI 3D Studio backend successfully.' });
      refreshSystemStats();
    } else {
      setTestResult({ success: false, msg: `Backend server unreachable. Ensure FastAPI is running.` });
      refreshSystemStats();
    }
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) setIsSettingsOpen(false); }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 select-none animate-in fade-in duration-200"
    >
      <div className="w-full max-w-xl rounded-2xl bg-[#181a20] border border-white/[0.08] shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-[#1e2026] border-b border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#F9CF00]/15 border border-[#F9CF00]/30 flex items-center justify-center text-[#F9CF00]">
              <Server className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">Backend Configuration</h3>
              <p className="text-[11px] text-zinc-400">Connect to local or cloud 3D Generation Pipeline</p>
            </div>
          </div>
          <button
            onClick={() => setIsSettingsOpen(false)}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-xs bg-[#0d0d0d]">
          {/* Host & Port Input */}
          <div className="space-y-1.5">
            <label className="font-medium text-[#888]">Backend Server URL</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="/api/v1"
                className="flex-1 px-3 py-2 rounded-xl bg-[#111] border border-[#1a1a1a] text-xs font-mono text-white focus:border-[#F9CF00] outline-none"
              />
              <button
                onClick={handleTestConnection}
                disabled={testing}
                className="px-4 py-2 rounded-xl bg-[#1a1a1a] hover:bg-[#222] border border-[#222] text-[#F9CF00] font-bold text-xs flex items-center gap-1.5 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
                <span>{testing ? 'Testing...' : 'Test Link'}</span>
              </button>
            </div>
          </div>

          {/* Test Status Banner */}
          {testResult && (
            <div className={`p-3 rounded-xl border flex items-center gap-2.5 ${
              testResult.success ? 'bg-green-500/10 border-green-500/40 text-green-500' : 'bg-red-500/10 border-red-500/40 text-red-500'
            }`}>
              {testResult.success ? <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />}
              <span className="text-xs">{testResult.msg}</span>
            </div>
          )}

          {/* Node registry status (real /object_info data) */}
          <div className="space-y-2 pt-2">
            <span className="font-semibold text-xs text-[#444] uppercase tracking-wider">Backend Status & Hardware</span>
            <div className="p-3 rounded-xl bg-[#111] border border-[#1a1a1a] space-y-2">
              {nodeError ? (
                <div className="text-[11px] text-red-500">Backend unreachable: {nodeError}</div>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[#888]">FastAPI Status</span>
                    <span className={`text-[11px] font-mono font-bold ${systemStats.status === 'online' ? 'text-green-500' : 'text-red-500'}`}>
                      {systemStats.status === 'online' ? `Online (${systemStats.lastPingMs}ms)` : 'Offline'}
                    </span>
                  </div>
                  {systemStats.gpu && systemStats.gpu !== 'Unavailable' && (
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-[#666]">GPU</span>
                      <span className="font-mono text-white truncate max-w-[280px]">{systemStats.gpu}</span>
                    </div>
                  )}
                  {systemStats.vramUsedGb != null && (
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-[#666]">VRAM</span>
                      <span className="font-mono text-blue-400">{systemStats.vramUsedGb} / {systemStats.vramTotalGb || '?'} GB</span>
                    </div>
                  )}
                  {systemStats.pythonVersion && (
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-[#666]">Python / PyTorch</span>
                      <span className="font-mono text-[#666]">{systemStats.pythonVersion} {systemStats.torchVersion ? `· PyTorch ${systemStats.torchVersion}` : ''}</span>
                    </div>
                  )}
                </div>
              )}
              <div className="text-[10px] text-[#444] pt-1 border-t border-[#1a1a1a]">AI 3D Studio connects through the configured /api/v1 backend proxy.</div>
            </div>
          </div>

          {/* Auto-Optimize Defaults */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center gap-2">
              <Wrench className="w-3.5 h-3.5 text-[hsl(var(--primary))]" />
              <span className="font-semibold text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Auto-Optimize Defaults</span>
            </div>
            <div className="p-3 rounded-xl bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs text-[hsl(var(--foreground))] font-medium block">Enable Auto-Optimize by Default</span>
                  <span className="text-[10px] text-[hsl(var(--muted-foreground))]">Automatically optimize meshes after generation</span>
                </div>
                <button
                  onClick={() => setGenerationSettings(prev => ({ ...prev, autoOptimize: !prev.autoOptimize }))}
                  className={`w-9 h-5 rounded-full p-0.5 transition-colors ${
                    generationSettings.autoOptimize ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--border))]'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full bg-[hsl(var(--surface-1))] transition-transform ${
                    generationSettings.autoOptimize ? 'translate-x-4' : 'translate-x-0'
                  }`} />
                </button>
              </div>

              {generationSettings.autoOptimize && (
                <div className="space-y-2.5 pt-2 border-t border-[hsl(var(--surface-1))]">
                  {/* Default Target Polycount */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-[hsl(var(--foreground))]">Default Target Polycount</span>
                      <span className="text-[10px] font-mono text-[hsl(var(--primary))]">{generationSettings.autoOptimizeSettings.targetPolycount.toLocaleString()} tris</span>
                    </div>
                    <input
                      type="range"
                      min={5000}
                      max={100000}
                      step={5000}
                      value={generationSettings.autoOptimizeSettings.targetPolycount}
                      onChange={(e) => setGenerationSettings(prev => ({
                        ...prev,
                        autoOptimizeSettings: { ...prev.autoOptimizeSettings, targetPolycount: parseInt(e.target.value) }
                      }))}
                      className="w-full h-1.5 rounded-full appearance-none bg-[hsl(var(--border))] accent-[hsl(var(--primary))] cursor-pointer"
                    />
                  </div>

                  {/* Default Fix UVs */}
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[11px] text-[hsl(var(--foreground))] font-medium block">Fix UVs by Default</span>
                      <span className="text-[10px] text-[hsl(var(--muted-foreground))]">Repair overlapping UVs automatically</span>
                    </div>
                    <button
                      onClick={() => setGenerationSettings(prev => ({
                        ...prev,
                        autoOptimizeSettings: { ...prev.autoOptimizeSettings, fixUVs: !prev.autoOptimizeSettings.fixUVs }
                      }))}
                      className={`w-9 h-5 rounded-full p-0.5 transition-colors ${
                        generationSettings.autoOptimizeSettings.fixUVs ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--border))]'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full bg-[hsl(var(--surface-1))] transition-transform ${
                        generationSettings.autoOptimizeSettings.fixUVs ? 'translate-x-4' : 'translate-x-0'
                      }`} />
                    </button>
                  </div>

                  {/* Default Preserve Details */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-[hsl(var(--foreground))]">Default Detail Preservation</span>
                      <span className="text-[10px] font-mono text-[hsl(var(--primary))]">{generationSettings.autoOptimizeSettings.preserveDetails}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={generationSettings.autoOptimizeSettings.preserveDetails}
                      onChange={(e) => setGenerationSettings(prev => ({
                        ...prev,
                        autoOptimizeSettings: { ...prev.autoOptimizeSettings, preserveDetails: parseInt(e.target.value) }
                      }))}
                      className="w-full h-1.5 rounded-full appearance-none bg-[hsl(var(--border))] accent-[hsl(var(--primary))] cursor-pointer"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 bg-[#1e2026] border-t border-white/[0.08]">
          <button
            onClick={() => setIsSettingsOpen(false)}
            className="px-4 py-2 rounded-xl bg-white/[0.04] text-zinc-400 hover:bg-white/[0.08] hover:text-white font-medium text-xs transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#FFE24C] to-[#F9CF00] hover:brightness-105 active:scale-95 text-black font-extrabold text-xs shadow-md shadow-[#F9CF00]/20 transition-all cursor-pointer border border-white/20"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};
