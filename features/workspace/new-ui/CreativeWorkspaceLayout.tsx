"use client";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */


import React, { useState, useEffect, useMemo, useRef } from 'react';
import anime from 'animejs';
import { motion, AnimatePresence } from 'motion/react';
import {
  Folder, Cpu, RefreshCw, Palette, Bookmark, Layers, Heart, Globe, Code, Settings, Sparkles, HelpCircle, LogOut, Activity, Zap, Wifi, ChevronDown, Box
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
import { cn } from '@/lib/utils';

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
import { ThreeDGenWorkspace } from '@/features/workspace/ThreeDGenWorkspace';

import { HistoryItem } from '@/types/new-ui';
// import { useGenerationHistory } from '@/hooks/useBackendData';

interface CreativeWorkspaceLayoutProps {
  onToggleLayout?: () => void;
  defaultTab?: string;
}

export default function CreativeWorkspaceLayout({ onToggleLayout, defaultTab }: CreativeWorkspaceLayoutProps = {}) {
  const searchParams = useSearchParams();
  const validTabs = ['3D Gen', 'Dashboard', 'Rigging & Animation', 'Remesh', 'Texture Gen', 'My Assets', 'Models', 'Favorites', 'Community', 'API Access', 'Settings'];
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
    <div className="flex flex-1 min-h-0 min-w-0 bg-[#1a1b1e] text-white" id="creative-layout-container">
      {/* Mobile drawer overlay for the main sidebar */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar panel — responsive: static on desktop, slide-in drawer on mobile */}
      <aside className={`${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 fixed inset-y-0 left-0 z-[60] w-[280px] max-w-[85vw] lg:static lg:z-20 lg:w-[300px] bg-black border-r border-white/5 flex flex-col min-h-0 flex-shrink-0 transition-transform duration-500 ease-in-out shadow-[10px_0_40px_rgba(0,0,0,0.5)]`} id="creative-sidebar">
        {/* Minimal Brand Header */}
        <div className="h-16 flex items-center px-8 border-b border-white/[0.03] flex-shrink-0" id="creative-logo-header">
          <div className="flex items-center gap-4">
            <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.2)]">
              <Sparkles size={18} className="text-black" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-[12px] font-black tracking-[-0.01em] uppercase text-white">GENESIS</span>
              <span className="text-[8px] font-black text-amber-500/50 uppercase tracking-[0.3em] mt-1.5">v2.5 ELITE</span>
            </div>
          </div>
        </div>

        {/* Navigation Links */}
        <div className="flex-1 py-8 px-5 overflow-y-auto space-y-1.5 min-h-0 scrollbar-thin" id="creative-sidebar-links">
          <div className="px-4 mb-5 flex items-center justify-between">
            <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.35em]">Command Center</span>
          </div>
          {sidebarItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSidebarItem === item.label;
            return (
              <button
                key={item.label}
                onClick={() => { setActiveSidebarItem(item.label); setMobileMenuOpen(false); }}
                className={cn(
                  "flex items-center gap-4 px-5 py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.15em] transition-all duration-500 text-left w-full group relative overflow-hidden",
                  isActive
                    ? 'text-black bg-amber-500 shadow-[0_10px_30px_rgba(245,158,11,0.2)]'
                    : 'text-white/30 hover:text-white hover:bg-white/[0.03]'
                )}
                id={`sidebar-nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <Icon size={18} className={cn("transition-all duration-500", isActive ? 'text-black scale-110' : 'text-white/10 group-hover:text-amber-500 group-hover:scale-110')} />
                <span className="relative z-10">{item.label}</span>
                {isActive && (
                  <motion.div
                    layoutId="sidebar-active-glow"
                    className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent pointer-events-none"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Footer controls */}
        <div className="py-8 border-t border-white/[0.03] bg-white/[0.01] flex flex-col gap-6 flex-shrink-0" id="creative-sidebar-footer">
          {/* Status indicators */}
          <div className="px-5 flex flex-col gap-4">
            <div className="px-4 mb-1 flex items-center justify-between">
              <span className="text-[9px] font-black text-white/10 uppercase tracking-[0.35em]">Hardware Telemetry</span>
              <button 
                onClick={() => setMonitorExpanded(!monitorExpanded)}
                className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-white/5 text-white/20 hover:text-white transition-all duration-300"
              >
                <ChevronDown size={14} className={cn("transition-transform duration-500", monitorExpanded ? '' : '-rotate-90')} />
              </button>
            </div>

            <AnimatePresence initial={false}>
              {monitorExpanded && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="flex flex-col gap-3 overflow-hidden"
                >
                  {/* GPU Item */}
                  <div className="flex flex-col gap-1.5">
                    <button 
                      onClick={() => setGpuExpanded(!gpuExpanded)}
                      className="flex items-center justify-between w-full px-5 py-3.5 rounded-2xl bg-white/[0.02] border border-white/[0.05] hover:border-white/10 hover:bg-white/[0.04] transition-all duration-500 text-left group"
                    >
                      <div className="flex items-center gap-3">
                        <Cpu className={cn("w-4 h-4 transition-colors duration-500", gpuExpanded ? "text-amber-500" : "text-white/20 group-hover:text-amber-500")} />
                        <span className="text-[10px] font-black uppercase tracking-[0.15em] text-white/40 group-hover:text-white/80 transition-colors">Neural Engine</span>
                      </div>
                      <ChevronDown size={12} className={cn("text-white/10 transition-transform duration-500", gpuExpanded ? 'rotate-180' : '')} />
                    </button>

                    <AnimatePresence>
                      {gpuExpanded && (
                        <motion.div 
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="px-5 py-4 mt-1.5 rounded-2xl bg-white/[0.01] border border-white/[0.03] text-[9px] space-y-3 shadow-inner" id="gpu-expanded-details">
                            <div className="flex justify-between items-center">
                              <span className="text-white/20 font-black uppercase tracking-widest">Compute Unit</span>
                              <span className="font-black text-white/60 truncate max-w-[140px]">
                                {runtime?.gpu_name || "NVIDIA H100 TENSOR"}
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-white/20 font-black uppercase tracking-widest">Efficiency</span>
                              <span className="font-black text-amber-500">
                                {runtime ? `${runtime.gpu_utilization}%` : '98.4%'}
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-white/20 font-black uppercase tracking-widest">Thermal Index</span>
                              <span className="font-black text-rose-500/60">
                                {runtime ? `${runtime.gpu_temp}°C` : '42°C'}
                              </span>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* VRAM Metric */}
                  <div className="flex flex-col gap-3 p-5 rounded-2xl bg-white/[0.02] border border-white/[0.05] hover:border-white/10 transition-all duration-500">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Zap className="w-4 h-4 text-sky-400/80" />
                        <span className="text-[10px] font-black uppercase tracking-[0.15em] text-white/40">Latent Memory</span>
                      </div>
                      <span className="text-[10px] font-black text-white/80 tabular-nums">
                        {runtime ? `${(runtime.vram_used_mb / 1024).toFixed(1)}GB` : '12.4GB'}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${vramPercentage || 65}%` }}
                        className="h-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-1000 shadow-[0_0_10px_rgba(245,158,11,0.3)]"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex flex-col gap-1 px-5">
            <button className="flex items-center gap-4 px-5 py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] text-white/20 hover:text-white hover:bg-white/[0.03] transition-all text-left group">
              <HelpCircle size={18} className="text-white/10 group-hover:text-white/40 transition-colors" />
              <span>Synthesis Help</span>
            </button>
            <button className="flex items-center gap-4 px-5 py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] text-rose-500/40 hover:text-rose-500 hover:bg-rose-500/5 transition-all text-left group">
              <LogOut size={18} className="text-rose-500/20 group-hover:text-rose-500/40 transition-colors" />
              <span>Terminate Session</span>
            </button>
          </div>
        </div>
      </aside>


      {/* Main viewport panels */}
        <main ref={mainRef} className="flex-1 flex flex-col bg-[#1a1b1e] overflow-hidden" id="creative-main-viewport">
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

        {activeSidebarItem === 'Community' && (
          <CommunityTab
            onCloneProject={handleCloneProject}
            onNavigate={setActiveSidebarItem}
          />
        )}

        {activeSidebarItem === 'API Access' && <ApiAccessTab />}

        {activeSidebarItem === 'Settings' && <WorkspaceSettingsTab />}
      </main>
    </div>
  );
}
