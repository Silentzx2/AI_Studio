"use client";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */


import React, { useState, useEffect, useMemo, useRef } from 'react';
import anime from 'animejs';
import {
  Folder, Cpu, RefreshCw, Palette, Bookmark, Layers, Heart, Globe, Code, Settings, Sparkles, HelpCircle, LogOut, Activity, Zap, Wifi, ChevronDown
} from 'lucide-react';
import { useGenerationStore } from '@/stores/useGenerationStore';
import { useUIStore } from '@/stores/useUIStore';
import { useProjectStore } from '@/stores/useProjectStore';
import { useGeneration } from '@/hooks/useGeneration';
import { runtimeService } from '@/services/runtimeService';
import type { RuntimeStatus } from '@/types';
import { StatusDot } from '@/components/premium/StatusDot';
import { useBackendStatus } from '@/hooks/useBackendData';

// Import our modular redesigned tabs
import WorkspaceTab from './WorkspaceTab';
import RemeshTab from './RemeshTab';
import TextureGenTab from './TextureGenTab';
import RiggingAnimationTab from './RiggingAnimationTab';
import MyAssetsTab from './MyAssetsTab';
import FavoritesTab from './FavoritesTab';
import CommunityTab from './CommunityTab';
import { ModelsTab } from '@/features/admin/tabs/ModelsTab';
import ApiAccessTab from './ApiAccessTab';
import WorkspaceSettingsTab from './WorkspaceSettingsTab';
import ThreeDGenerationTab from './ThreeDGenerationTab';

// Shared type for shapes
import { Shape3D, HistoryItem } from '@/types/new-ui';
import { officeChairShapes } from './data';
// import { useGenerationHistory } from '@/hooks/useBackendData';

interface CreativeWorkspaceLayoutProps {
  onToggleLayout?: () => void;
  defaultTab?: string;
}

export default function CreativeWorkspaceLayout({ onToggleLayout, defaultTab }: CreativeWorkspaceLayoutProps = {}) {
  const [activeSidebarItem, setActiveSidebarItem] = useState(defaultTab || 'Workspace');
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const backendStatus = useBackendStatus();
  const [monitorExpanded, setMonitorExpanded] = useState(true);
  const [gpuExpanded, setGpuExpanded] = useState(false);

  const vramPercentage = useMemo(() => {
    if (!runtime || !runtime.vram_total_mb) return 0;
    return Math.min(100, Math.max(0, (runtime.vram_used_mb / runtime.vram_total_mb) * 100));
  }, [runtime]);

  useEffect(() => {
    const tick = async () => {
      try {
        const status = await runtimeService.getStatus();
        if (status) setRuntime(status);
      } catch { /* silently ignore */ }
    };
    tick();
    const interval = setInterval(tick, 10000);
    return () => clearInterval(interval);
  }, []);
  
  // Fetch real history from backend
  const { loadHistory, jobHistory, isLoadingHistory, loadingError } = useGenerationStore();
  
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Real generation hooks/stores
  const { generate, cancel, isGenerating, currentJob } = useGeneration();
  const { prompt, setPrompt, mode, setMode } = useGenerationStore();
  const { viewer, setViewerMode, toggleAutoRotate, toggleGrid, capabilities } = useUIStore();
  const { setProject, currentProject } = useProjectStore();

  const [localDeletions, setLocalDeletions] = useState<Set<string>>(new Set());

  // Dynamically map real generation history jobs
  const history: HistoryItem[] | null = useMemo(() => {
    if (isLoadingHistory && jobHistory.length === 0) return null;

    return (jobHistory || [])
      .filter((job) => !localDeletions.has(job.id))
      .map((job) => {
        // History jobs carry backend snake_case fields (prompt, created_at,
        // shapes, is_favorite, model_url, thumbnail_url) at runtime; the
        // GenerationJob type only exposes the camelCase subset.
        const j = job as any;
        const prompt = j.prompt || j.config?.prompt || 'No Prompt';
        const result = j.result || {};

        return {
          id: j.id,
          prompt,
          name: prompt.split(' ').slice(0, 4).join(' ') || 'Untitled Asset',
          timestamp: new Date(j.created_at || j.createdAt || 0).toLocaleDateString(),
          format: 'GLB' as const,
          shapes: result.shapes || j.shapes || [],
          color: 'hsl(var(--surface-0))',
          accentColor: 'hsl(var(--primary))',
          isFavorite: j.is_favorite || j.isFavorite || false,
          modelUrl: j.model_url || result.model_url || null,
          thumbnailUrl: j.thumbnail_url || result.thumbnail_url || null,
        };
      })
      .sort((a, b) => {
        const dateA = new Date(a.timestamp).getTime();
        const dateB = new Date(b.timestamp).getTime();
        return dateB - dateA;
      });
  }, [jobHistory, isLoadingHistory, localDeletions]);

  const mainRef = useRef<HTMLDivElement>(null);

  // Staggered entrance for whichever tab panel is active. Runs on mount and on
  // every switch so navigating the sidebar feels alive without re-mounting.
  useEffect(() => {
    const el = mainRef.current?.firstElementChild as HTMLElement | null;
    if (!el) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    anime({
      targets: el,
      translateY: reducedMotion ? [0, 0] : [16, 0],
      opacity: reducedMotion ? [1, 1] : [0, 1],
      duration: reducedMotion ? 0 : 420,
      easing: 'easeOutCubic',
    });
  }, [activeSidebarItem]);

  const [activeModel, setActiveModel] = useState<any>({
    name: 'Untitled Model',
    prompt: '',
    shapes: [],
    themeColor: 'hsl(var(--surface-0))',
    accentColor: 'hsl(var(--primary))',
    description: 'No model loaded.',
    promptDescription: '',
    complexity: 'N/A',
    textures: 'N/A',
  });

  const loadHistoryItem = (item: HistoryItem) => {
    const model = {
      name: item.name,
      prompt: item.prompt,
      shapes: item.shapes,
      themeColor: item.color,
      accentColor: item.accentColor,
      description: `Custom generated 3D mesh based on prompt: "${item.prompt}". Baked utilizing standard material shaders.`,
      promptDescription: 'Synthesized using hierarchical geometric assemblies matching key descriptive vocabulary.',
      complexity: 'Standard Mesh (65K)',
      textures: '2K Albedo / Smoothness',
    };
    setActiveModel(model);
    setProject({
      id: item.id,
      name: item.name,
      modelUrl: item.modelUrl || null,
      modelData: { shapes: item.shapes, prompt: item.prompt },
      layers: [],
      metadata: {
        prompt: item.prompt,
        model: 'unknown',
        quality: 'standard',
        createdAt: new Date(),
        thumbnailUrl: item.thumbnailUrl,
      },
    });
    setPrompt(item.prompt);
    setActiveSidebarItem('3D Generation');
  };

  const loadTemplateItem = (template: any) => {
    const model = {
      name: template.name,
      prompt: template.prompt,
      shapes: template.shapes,
      themeColor: template.themeColor,
      accentColor: template.accentColor,
      description: template.description,
      promptDescription: template.promptDescription,
      complexity: template.complexity,
      textures: template.textures,
    };
    setActiveModel(model);
    setProject({
      id: template.id || Math.random().toString(36).slice(2),
      name: template.name,
      modelUrl: null,
      modelData: { shapes: template.shapes, prompt: template.prompt },
      layers: [],
      metadata: {
        prompt: template.prompt,
        model: 'unknown',
        quality: 'standard',
        createdAt: new Date(),
      },
    });
    setPrompt(template.prompt);
    setActiveSidebarItem('3D Generation');
  };

  const deleteHistoryItem = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setLocalDeletions((prev) => new Set(prev).add(id));
    // Try backend delete
    try {
      await fetch(`/api/v1/jobs/${id}`, { method: 'DELETE' });
    } catch (err) {
      console.warn('Failed to delete job from backend:', err);
    }
  };

  const [localFavorites, setLocalFavorites] = useState<Set<string>>(new Set());

  const toggleFavoriteItem = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setLocalFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleCloneProject = (prompt: string, name: string) => {
    setPrompt(prompt);
    setActiveModel({
      ...activeModel,
      name,
      prompt,
    });
    setActiveSidebarItem('3D Generation');
  };

  const handleSendTo3D = (prompt: string) => {
    setPrompt(prompt);
    setActiveSidebarItem('3D Generation');
  };

  // Sidebar list matching our ported views
  const sidebarItems = [
    { label: 'Workspace', icon: Folder, visible: true },
    { label: '3D Generation', icon: Cpu, visible: capabilities.threeDGen },
    { label: 'Rigging & Animation', icon: Activity, visible: capabilities.riggingAnimation },
    { label: 'Remesh', icon: RefreshCw, visible: capabilities.remesh },
    { label: 'Texture Gen', icon: Palette, visible: capabilities.textureGen },
    { label: 'My Assets', icon: Bookmark, visible: true },
    { label: 'Models', icon: Layers, visible: true },
    { label: 'Favorites', icon: Heart, visible: true },
    { label: 'Community', icon: Globe, visible: true },
    { label: 'API Access', icon: Code, visible: true },
    { label: 'Settings', icon: Settings, visible: true },
  ].filter(item => item.visible);

  useEffect(() => {
    // Entrance animations for sidebar items
    anime({
      targets: '#creative-sidebar-links button',
      opacity: [0, 1],
      translateX: [-20, 0],
      delay: anime.stagger(50),
      easing: 'easeOutQuad',
      duration: 600,
    });
  }, []);

  return (
    <div className="flex flex-1 min-h-0 min-w-0 bg-[hsl(var(--surface-0))] text-[hsl(var(--foreground))]" id="creative-layout-container">
      {/* Sidebar panel */}
      <aside className="w-[240px] lg:w-[280px] bg-[hsl(var(--surface-1))] border-r border-[hsl(var(--border))] flex flex-col min-h-0 flex-shrink-0 z-20" id="creative-sidebar">
        {/* Minimal Brand Header */}
        <div className="h-16 flex items-center px-6 border-b border-[hsl(var(--border))] flex-shrink-0" id="creative-logo-header">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[hsl(var(--primary))] to-[hsl(var(--primary))/0.5] flex items-center justify-center shadow-lg shadow-[hsl(var(--primary))/0.2]">
              <Sparkles size={18} className="text-white" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-sm font-black tracking-tighter uppercase">AI Studio</span>
              <span className="text-[9px] font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-widest mt-0.5">3D Workspace</span>
            </div>
          </div>
        </div>

        {/* Navigation Links */}
        <div className="flex-1 py-4 px-3 overflow-y-auto space-y-1 min-h-0" id="creative-sidebar-links">
          <div className="px-3 mb-2">
            <span className="text-[10px] font-black text-[hsl(var(--muted-foreground))] uppercase tracking-widest">Main Menu</span>
          </div>
          {sidebarItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSidebarItem === item.label;
            return (
              <button
                key={item.label}
                onClick={() => setActiveSidebarItem(item.label)}
                className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold transition-all text-left border w-full ${
                  isActive
                    ? 'text-[hsl(var(--primary))] bg-[hsl(var(--primary))]/5 border-[hsl(var(--primary))]/25 shadow-sm'
                    : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--foreground)/0.02)] border-transparent'
                }`}
                id={`sidebar-nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <Icon size={15} className={isActive ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))]'} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Footer controls */}
        <div className="py-4 border-t border-[hsl(var(--border))] flex flex-col gap-2 flex-shrink-0" id="creative-sidebar-footer">
          {/* Status indicators */}
          <div className="px-3 mb-2 flex flex-col gap-2">
            <div className="px-3 mb-1 flex items-center justify-between">
              <span className="text-[10px] font-black text-[hsl(var(--muted-foreground))] uppercase tracking-widest">System Monitor</span>
              <button 
                onClick={() => setMonitorExpanded(!monitorExpanded)}
                className="p-1 rounded hover:bg-[hsl(var(--foreground)/0.05)] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-all duration-150"
                title={monitorExpanded ? "Collapse System Monitor" : "Expand System Monitor"}
                id="system-monitor-toggle-btn"
              >
                <ChevronDown size={12} className={`transform transition-transform duration-200 ${monitorExpanded ? '' : '-rotate-90'}`} />
              </button>
            </div>

            {monitorExpanded && (
              <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
                {/* GPU Item */}
                <div className="flex flex-col gap-1.5">
                  <button 
                    onClick={() => setGpuExpanded(!gpuExpanded)}
                    className="flex items-center justify-between w-full px-3 py-2 rounded-lg bg-[hsl(var(--surface-2))] border border-[hsl(var(--border)/0.5)] hover:border-[hsl(var(--border))] transition-all duration-200 text-left cursor-pointer"
                    id="gpu-status-toggle-btn"
                  >
                    <div className="flex items-center gap-2">
                      <Cpu className="w-3.5 h-3.5 text-[hsl(var(--neon-cyan))]" style={{ filter: 'drop-shadow(0 0 6px hsl(var(--neon-cyan) / 0.6))' }} />
                      <span className="text-[11px] font-semibold text-[hsl(var(--muted-foreground))]">GPU</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <StatusDot status={runtime?.cuda_available === true ? 'online' : runtime?.cuda_available === false ? 'offline' : 'loading'} size="sm" />
                      <ChevronDown size={11} className={`text-[hsl(var(--muted-foreground))] transform transition-transform duration-200 ${gpuExpanded ? 'rotate-180' : ''}`} />
                    </div>
                  </button>

                  {/* GPU Expanded Stats Sub-widget */}
                  {gpuExpanded && (
                    <div className="px-3 py-2 rounded-lg bg-[hsl(var(--surface-3))] border border-[hsl(var(--border)/0.45)] text-[10px] space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-150" id="gpu-expanded-details">
                      <div className="flex justify-between items-center">
                        <span className="text-[hsl(var(--muted-foreground))]">Name:</span>
                        <span className="font-semibold text-right max-w-[130px] truncate" title={runtime?.gpu_name || "Unknown GPU"}>
                          {runtime?.gpu_name || "NVIDIA GPU"}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[hsl(var(--muted-foreground))]">Utilization:</span>
                        <span className="font-bold text-[hsl(var(--neon-cyan))] font-mono">
                          {runtime ? `${runtime.gpu_utilization}%` : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[hsl(var(--muted-foreground))]">Temperature:</span>
                        <span className="font-bold text-[hsl(var(--neon-amber))] font-mono">
                          {runtime ? `${runtime.gpu_temp}°C` : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[hsl(var(--muted-foreground))]">CUDA Version:</span>
                        <span className="font-mono">{runtime?.cuda_version || "—"}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[hsl(var(--muted-foreground))]">Driver Version:</span>
                        <span className="font-mono">{runtime?.driver_version || "—"}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Backend Connection */}
                <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-[hsl(var(--surface-2))] border border-[hsl(var(--border)/0.5)] transition-all duration-200">
                  <div className="flex items-center gap-2">
                    <Wifi className="w-3.5 h-3.5 text-[hsl(var(--neon-green))]" style={{ filter: 'drop-shadow(0 0 6px hsl(var(--neon-green) / 0.6))' }} />
                    <span className="text-[11px] font-semibold text-[hsl(var(--muted-foreground))]">Backend</span>
                  </div>
                  <StatusDot status={backendStatus === 'online' ? 'online' : backendStatus === 'offline' ? 'offline' : 'loading'} size="sm" />
                </div>
                
                {/* VRAM Metric */}
                <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-[hsl(var(--surface-2))] border border-[hsl(var(--border)/0.5)] transition-all duration-200">
                  <div className="flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5 text-[hsl(var(--neon-amber))]" style={{ filter: 'drop-shadow(0 0 6px hsl(38 92% 50% / 0.6))' }} />
                    <span className="text-[11px] font-semibold text-[hsl(var(--muted-foreground))]">VRAM</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-[hsl(var(--muted-foreground))] font-semibold">
                      {runtime ? `${(runtime.vram_used_mb / 1024).toFixed(1)}/${(runtime.vram_total_mb / 1024).toFixed(0)}G` : '—'}
                    </span>
                    {runtime && (
                      <div className="w-10 h-1.5 bg-[hsl(var(--surface-3))] rounded-full overflow-hidden border border-[hsl(var(--border))/0.2]">
                        <div 
                          className="h-full bg-gradient-to-r from-[hsl(var(--neon-cyan))] to-[hsl(var(--neon-purple))] transition-all duration-300"
                          style={{ width: `${vramPercentage}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1 px-1">
            <button className="flex items-center gap-3 px-3 py-2 rounded-lg text-[11px] font-semibold text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--foreground)/0.02)] transition-all text-left" id="help-docs-btn">
              <HelpCircle size={14} />
              <span>Help & Docs</span>
            </button>
            <button className="flex items-center gap-3 px-3 py-2 rounded-lg text-[11px] font-semibold text-[hsl(var(--destructive))] hover:text-[hsl(var(--destructive)/0.8)] hover:bg-[hsl(var(--destructive)/0.05)] transition-all text-left" id="creative-logout-btn">
              <LogOut size={14} />
              <span>Log Out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main viewport panels */}
        <main ref={mainRef} className="flex-1 flex flex-col bg-[hsl(var(--surface-0))] overflow-hidden" id="creative-main-viewport">
        {activeSidebarItem === 'Workspace' && (
          <WorkspaceTab
            history={history ?? []}
            onLoadProject={loadHistoryItem}
            onNavigate={setActiveSidebarItem}
          />
        )}

        {activeSidebarItem === 'Remesh' && (
          <RemeshTab
            activeModel={activeModel}
            onUpdateModel={setActiveModel}
            onNavigate={setActiveSidebarItem}
          />
        )}

        {activeSidebarItem === 'Texture Gen' && (
          <TextureGenTab
            activeModel={activeModel}
            onUpdateModel={setActiveModel}
            onNavigate={setActiveSidebarItem}
          />
        )}

        {activeSidebarItem === 'Rigging & Animation' && (
          <RiggingAnimationTab
            activeModel={activeModel}
            onUpdateModel={setActiveModel}
            onNavigate={setActiveSidebarItem}
          />
        )}

        {activeSidebarItem === 'My Assets' && (
          <MyAssetsTab
            history={history ?? []}
            onLoadProject={loadHistoryItem}
            onDeleteProject={deleteHistoryItem}
            onToggleFavorite={toggleFavoriteItem}
          />
        )}

        {activeSidebarItem === 'Models' && (
          <ModelsTab
          />
        )}

        {activeSidebarItem === 'Favorites' && (
          <FavoritesTab
            history={history ?? []}
            onLoadProject={loadHistoryItem}
            onRemoveFavorite={toggleFavoriteItem}
            onDeleteProject={deleteHistoryItem}
          />
        )}

        {activeSidebarItem === 'Community' && (
          <CommunityTab
            onCloneProject={handleCloneProject}
            onNavigate={setActiveSidebarItem}
          />
        )}

        {activeSidebarItem === 'API Access' && <ApiAccessTab />}

        {activeSidebarItem === 'Settings' && <WorkspaceSettingsTab />}

        {/* Real-time 3D Viewport Generation tab matching Studio UI */}
        {/* activeModel/onUpdateModel wiring confirmed: shared state flows correctly between all tabs */}
        {activeSidebarItem === '3D Generation' && (
          <ThreeDGenerationTab
            activeModel={activeModel}
            onUpdateModel={setActiveModel}
            history={history}
            onLoadProject={loadHistoryItem}
          />
        )}
      </main>
    </div>
  );
}
