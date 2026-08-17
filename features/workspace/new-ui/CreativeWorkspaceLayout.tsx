"use client";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */


import React, { useState, useEffect, useMemo, useRef } from 'react';
import anime from 'animejs';
import {
  Folder, Cpu, RefreshCw, Palette, Bookmark, Layers, Heart, Code, Settings,
  Sparkles, HelpCircle, LogOut, Activity, Zap, Wifi, ChevronDown, Box
} from 'lucide-react';
import { useGenerationStore } from '@/stores/useGenerationStore';
import { useUIStore } from '@/stores/useUIStore';
import { useProjectStore } from '@/stores/useProjectStore';
import { useGeneration } from '@/hooks/useGeneration';
import { useSearchParams } from 'next/navigation';
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
import { ModelsTab } from '@/features/admin/tabs/ModelsTab';
import ApiAccessTab from './ApiAccessTab';
import WorkspaceSettingsTab from './WorkspaceSettingsTab';
import { ThreeDGenWorkspace } from '@/features/workspace/ThreeDGenWorkspace';

import { HistoryItem } from '@/types/new-ui';
// import { useGenerationHistory } from '@/hooks/useBackendData';

import { cn } from '@/lib/utils';

interface CreativeWorkspaceLayoutProps {
  onToggleLayout?: () => void;
  defaultTab?: string;
}

export default function CreativeWorkspaceLayout({ onToggleLayout, defaultTab }: CreativeWorkspaceLayoutProps = {}) {
  const searchParams = useSearchParams();
  const validTabs = ['3D Gen', 'Dashboard', 'Rigging & Animation', 'Remesh', 'Texture Gen', 'My Assets', 'Models', 'Favorites', 'API Access', 'Settings'];
  const requested = searchParams.get('tab') || defaultTab;
  // ponytail: legacy links/state may still say 'Workspace' — treat as 'Dashboard'.
  const normalized = requested === 'Workspace' ? 'Dashboard' : requested;
  const initialTab = validTabs.includes(normalized!) ? normalized! : 'Dashboard';
  const [activeSidebarItem, setActiveSidebarItem] = useState(initialTab);
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const backendStatus = useBackendStatus();
  const { mobileMenuOpen, setMobileMenuOpen } = useUIStore();
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
    setActiveSidebarItem('Dashboard');
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
    setActiveSidebarItem('Dashboard');
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
    setActiveSidebarItem('Dashboard');
  };

  const handleSendTo3D = (prompt: string) => {
    setPrompt(prompt);
    setActiveSidebarItem('Dashboard');
  };

  // Sidebar list matching our ported views
  const sidebarItems = [
    { label: 'Dashboard', icon: Folder, visible: true },
    { label: '3D Gen', icon: Box, visible: capabilities.threeDGen },
    { label: 'Rigging & Animation', icon: Activity, visible: capabilities.riggingAnimation },
    { label: 'Remesh', icon: RefreshCw, visible: capabilities.remesh },
    { label: 'Texture Gen', icon: Palette, visible: capabilities.textureGen },
    { label: 'My Assets', icon: Bookmark, visible: true },
    { label: 'Models', icon: Layers, visible: true },
    { label: 'Favorites', icon: Heart, visible: true },
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

  // Tripo-style sidebar: clean minimal with subtle hover
  const getSidebarItemClass = (label: string) => {
    const isActive = activeSidebarItem === label;
    return cn(
      'flex items-center gap-3 px-3 py-2 rounded-full text-sm font-medium transition-all duration-150',
      'text-left w-full',
      isActive
        ? 'bg-[hsl(var(--primary))/0.08] text-[hsl(var(--primary))]'
        : 'text-white/50 hover:text-white/80 hover:bg-white/5'
    );
  };

  const getSidebarIconClass = (isActive: boolean) => {
    return cn(
      'w-4 h-4',
      isActive
        ? 'text-[hsl(var(--primary))]'
        : 'text-white/30 group-hover:text-white/60 transition-colors'
    );
  };

  const getSidebarLinksClass = () => {
    return cn(
      'flex-1 py-4 px-4 overflow-y-auto space-y-1 min-h-0'
    );
  };

  const getLogoHeaderClass = () => {
    return cn(
      'h-14',
      'flex items-center px-6',
      'border-b border-white/5',
      'flex-shrink-0'
    );
  };

  return (
    <div className="flex flex-1 min-h-0 min-w-0 bg-[#0a0a0a] text-[hsl(var(--foreground))]" id="creative-layout-container">
      {/* Mobile drawer overlay for the main sidebar */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar panel — responsive: static on desktop, slide-in drawer on mobile */}
      <aside className={`${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 fixed inset-y-0 left-0 z-50 w-[260px] max-w-[85vw] lg:static lg:z-20 lg:w-[280px] bg-black/40 backdrop-blur-[40px] border-r border-white/5 flex flex-col min-h-0 flex-shrink-0 transition-all duration-200`} id="creative-sidebar">
        {/* Minimal Brand Header */}
        <div className={getLogoHeaderClass()} id="creative-logo-header">
          <div className="flex items-center">
            <div className="w-7 h-7 rounded-full bg-[hsl(var(--primary))]/10 flex items-center justify-center">
              <Sparkles size={16} className="text-[hsl(var(--primary))]" />
            </div>
          </div>
        </div>

        {/* Navigation Links */}
        <div className={getSidebarLinksClass()} id="creative-sidebar-links">
          <div className="px-4 mb-3 mt-5">
            <span className="text-[11px] font-medium text-white/20">Navigation</span>
          </div>
          {sidebarItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSidebarItem === item.label;
            return (
              <button
                key={item.label}
                onClick={() => { setActiveSidebarItem(item.label); setMobileMenuOpen(false); }}
                className={getSidebarItemClass(item.label)}
                id={`sidebar-nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <Icon className={getSidebarIconClass(isActive)} size={16} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Footer controls */}
        <div className="py-5 border-t border-white/5 flex flex-col gap-3 flex-shrink-0" id="creative-sidebar-footer">
          {/* Status indicators */}
          <div className="px-4 flex flex-col gap-2.5">
            <div className="px-3 mb-0.5 flex items-center justify-between">
              <span className="text-[11px] text-white/20">Performance</span>
              <button
                onClick={() => setMonitorExpanded(!monitorExpanded)}
                className="p-1 rounded-md hover:bg-white/5 text-white/30 hover:text-white/60 transition-all duration-150"
              >
                <ChevronDown size={14} className={`transform transition-transform duration-200 ${monitorExpanded ? '' : '-rotate-90'}`} />
              </button>
            </div>

            {monitorExpanded && (
              <div className="flex flex-col gap-2">
                {/* GPU Item */}
                <div className="flex flex-col gap-1.5">
                  <button
                    onClick={() => setGpuExpanded(!gpuExpanded)}
                    className="flex items-center justify-between w-full px-3.5 py-2.5 rounded-lg bg-white/[0.03] border border-transparent hover:border-white/10 transition-all duration-200 text-left cursor-pointer group"
                  >
                    <div className="flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-white/50" />
                      <span className="text-[11px] font-medium uppercase tracking-wider text-white/50">GPU Stats</span>
                    </div>
                    <ChevronDown size={12} className={`text-white/30 transform transition-transform duration-200 ${gpuExpanded ? 'rotate-180' : ''}`} />
                  </button>

                  {/* GPU Expanded Stats Sub-widget */}
                  {gpuExpanded && (
                    <div className="px-3.5 py-2.5 rounded-lg bg-white/[0.02] border border-white/5 text-[11px] space-y-2" id="gpu-expanded-details">
                      <div className="flex justify-between items-center">
                        <span className="text-white/30 font-medium uppercase tracking-wider text-[10px]">Model</span>
                        <span className="font-medium text-white/80 truncate max-w-[120px]">
                          {runtime?.gpu_name || "NVIDIA H100"}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-white/30 font-medium uppercase tracking-wider text-[10px]">Load</span>
                        <span className="font-medium text-white/80">
                          {runtime ? `${runtime.gpu_utilization}%` : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-white/30 font-medium uppercase tracking-wider text-[10px]">Temp</span>
                        <span className="font-medium text-rose-400">
                          {runtime ? `${runtime.gpu_temp}°C` : '—'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* VRAM Metric */}
                <div className="flex flex-col gap-2 p-3.5 rounded-lg bg-white/[0.03] border border-transparent">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-white/30" />
                      <span className="text-[11px] font-medium uppercase tracking-wider text-white/50">Memory</span>
                    </div>
                    <span className="text-[11px] font-medium text-white/80">
                      {runtime ? `${(runtime.vram_used_mb / 1024).toFixed(1)}GB` : '—'}
                    </span>
                  </div>
                  {runtime && (
                    <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[hsl(var(--primary))] transition-all duration-300"
                        style={{ width: `${vramPercentage}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main viewport panels */}
        <main ref={mainRef} className="flex-1 flex flex-col bg-[#0a0a0a] overflow-hidden" id="creative-main-viewport">
        {activeSidebarItem === '3D Gen' && (
          <ThreeDGenWorkspace embedded />
        )}

        {activeSidebarItem === 'Dashboard' && (
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

        {activeSidebarItem === 'API Access' && <ApiAccessTab />}

        {activeSidebarItem === 'Settings' && <WorkspaceSettingsTab />}
      </main>
    </div>
  );
}
