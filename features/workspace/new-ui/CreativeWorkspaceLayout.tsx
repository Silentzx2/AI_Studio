"use client";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */


import React, { useState, useEffect, useMemo, useRef } from 'react';
import anime from 'animejs';
import {
  Folder, Cpu, RefreshCw, Palette, Bookmark, Layers, Heart, Code, Settings,
  Sparkles, HelpCircle, LogOut, Activity, Zap, Wifi, ChevronDown, Box,
  Menu, X, Plus, Grid3x3
} from 'lucide-react';
import { useGenerationStore } from '@/stores/useGenerationStore';
import { useUIStore } from '@/stores/useUIStore';
import { useProjectStore } from '@/stores/useProjectStore';
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

import { HistoryItem } from '@/types/new-ui';

// Global 3D workspace imports
import Canvas3D from '@/3D-SPACE/Canvas3D';
import GenerationControls from '@/3D-SPACE/GenerationControls';
import AssetPanel, { type AssetItem } from '@/3D-SPACE/AssetPanel';
import DynamicToolPanel from './DynamicToolPanel';
import RightContextPanel from './RightContextPanel';
import { useGeneration } from '@/hooks/useGeneration';
import { loadModelInViewer, useViewerStore } from '@/stores/useViewerStore';
import { toast } from 'sonner';
import AssetPanelHost from '@/features/workspace/AssetPanelHost';

import { cn } from '@/lib/utils';

interface CreativeWorkspaceLayoutProps {
  onToggleLayout?: () => void;
  defaultTab?: string;
}

export default function CreativeWorkspaceLayout({ onToggleLayout, defaultTab }: CreativeWorkspaceLayoutProps = {}) {
  const searchParams = useSearchParams();
  const validTabs = ['3D Gen', 'Dashboard', 'Rigging', 'Animation', 'Rigging & Animation', 'Remesh', 'Texture Gen', 'My Assets', 'Models', 'Favorites', 'API Access', 'Settings'];
  const requested = searchParams.get('tab') || defaultTab;
  // ponytail: legacy links/state may still say 'Workspace' — treat as 'Dashboard'.
  const normalized = requested === 'Workspace' ? 'Dashboard' : requested;
  const initialTab = validTabs.includes(normalized!) ? normalized! : 'Dashboard';
  const [activeSidebarItem, setActiveSidebarItem] = useState(initialTab);
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const backendStatus = useBackendStatus();
  const { mobileMenuOpen, setMobileMenuOpen } = useUIStore();
  const { setActiveContextTab } = useViewerStore();
  const [monitorExpanded, setMonitorExpanded] = useState(true);
  const [gpuExpanded, setGpuExpanded] = useState(false);

  const handleSwitchTab = (tab: string) => {
    setActiveSidebarItem(tab);
    setMobileMenuOpen(false);
    if (tab === 'Texture Gen') {
      setActiveContextTab('materials');
    } else if (tab === 'Rigging') {
      setActiveContextTab('rig');
    } else if (tab === 'Animation') {
      setActiveContextTab('animation');
    } else if (tab === 'Remesh') {
      setActiveContextTab('inspector');
    } else if (tab === '3D Gen') {
      setActiveContextTab('assets');
    }
  };

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

  // Unified global asset panel state (used by Canvas3D workspace tabs)
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const prevJobStatusRef = useRef<string | null>(null);

  function jobToAsset(job: any): AssetItem {
    const prompt: string = job?.prompt || job?.config?.prompt || 'No Prompt';
    const result = job?.result || {};
    return {
      id: job.id,
      name: prompt.split(' ').slice(0, 4).join(' ') || 'Untitled Asset',
      prompt,
      format: job?.format || 'GLB',
      timestamp: new Date(job?.created_at || job?.createdAt || 0).toLocaleDateString(),
      thumbnailUrl: job?.thumbnail_url || result?.thumbnailUrl || result?.thumbnail_url || null,
      modelUrl: job?.model_url || result?.modelUrl || result?.model_url || null,
      isFavorite: !!(job?.is_favorite || job?.isFavorite),
      job,
    };
  }

  const assets = useMemo<AssetItem[]>(
    () =>
      (jobHistory ?? [])
        .filter((job) => !localDeletions.has(job.id))
        .map(jobToAsset)
        .map((a) => (favorites.has(a.id) ? { ...a, isFavorite: true } : a)),
    [jobHistory, localDeletions, favorites]
  );

  const handleSelectAsset = (asset: AssetItem) => {
    setSelectedAssetId(asset.id);
    if (asset.modelUrl) loadModelInViewer(asset.modelUrl, asset.name);
  };

  const handleToggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeleteAsset = async (id: string) => {
    try {
      await fetch(`/api/v1/jobs/${id}`, { method: 'DELETE' });
      setSelectedAssetId((prev) => (prev === id ? null : prev));
      toast.success('Asset deleted');
      loadHistory();
    } catch {
      toast.error('Failed to delete asset');
    }
  };

  // Auto-select latest completed asset if none is selected
  useEffect(() => {
    if (!selectedAssetId && assets.length > 0) {
      const latestCompleted = assets.find((a) => !!a.modelUrl);
      if (latestCompleted) {
        setSelectedAssetId(latestCompleted.id);
        if (latestCompleted.modelUrl) {
          loadModelInViewer(latestCompleted.modelUrl, latestCompleted.name);
        }
      }
    }
  }, [assets, selectedAssetId]);

  // Refresh history when generation completes
  useEffect(() => {
    const status = currentJob?.status ?? null;
    const prevStatus = prevJobStatusRef.current;
    if (prevStatus && prevStatus !== 'completed' && status === 'completed') {
      loadHistory();
      const url = currentJob?.result?.downloadUrls?.glb || currentJob?.result?.modelUrl;
      if (url) loadModelInViewer(url);
    }
    prevJobStatusRef.current = status;
  }, [currentJob?.status, loadHistory]);

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
    handleSwitchTab('Dashboard');
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
    handleSwitchTab('Dashboard');
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
    handleSwitchTab('3D Gen');
  };

  const handleSendTo3D = (prompt: string) => {
    setPrompt(prompt);
    handleSwitchTab('3D Gen');
  };

  // Primary Studio Tools (Tripo Style Slim Rail)
  interface StudioNavItem {
    id: string;
    label: string;
    icon: any;
  }

  const primaryStudioTools: StudioNavItem[] = [
    { id: 'Dashboard', label: 'Home', icon: Folder },
    { id: '3D Gen', label: '3D Gen', icon: Box },
    { id: 'Texture Gen', label: 'Texture', icon: Palette },
    { id: 'Rigging & Animation', label: 'Rigging', icon: Activity },
    { id: 'Remesh', label: 'Remesh', icon: RefreshCw },
  ];

  const bottomStudioTools: StudioNavItem[] = [
    { id: 'My Assets', label: 'Assets', icon: Bookmark },
    { id: 'Models', label: 'Models', icon: Layers },
    { id: 'Favorites', label: 'Favorites', icon: Heart },
    { id: 'API Access', label: 'API', icon: Code },
    { id: 'Settings', label: 'Settings', icon: Settings },
  ];

  // Quick navigation items for top bar
  const topNavItems = [
    { label: 'Dashboard', tab: 'Dashboard' },
    { label: '3D Studio', tab: '3D Gen' },
    { label: 'Texture', tab: 'Texture Gen' },
    { label: 'Rigging', tab: 'Rigging & Animation' },
    { label: 'Remesh', tab: 'Remesh' },
    { label: 'Assets', tab: 'My Assets' },
  ];

  useEffect(() => {
    // Entrance animations for sidebar items
    anime({
      targets: '#tripo-slim-rail button',
      opacity: [0, 1],
      translateY: [-6, 0],
      delay: anime.stagger(15),
      easing: 'easeOutQuad',
      duration: 250,
    });
  }, []);

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0 bg-tripo-gray-1 text-foreground" id="creative-layout-container">
      {/* ── Clean & Minimal Top Navigation Bar ── */}
      <header className="h-10 border-b border-tripo-white-5 bg-tripo-gray-1/95 backdrop-blur-md z-30 flex items-center justify-between px-3 gap-3 select-none flex-shrink-0" id="creative-top-bar">
        {/* Left Section: Brand & Breadcrumb */}
        <div className="flex items-center gap-2.5">
          {/* Mobile menu trigger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-1 rounded-md text-tripo-gray-300 hover:text-white hover:bg-tripo-white-5 transition-colors cursor-pointer"
            aria-label="Toggle menu"
            id="mobile-menu-toggle-btn"
          >
            {mobileMenuOpen ? <X size={15} /> : <Menu size={15} />}
          </button>

          {/* Brand Mark */}
          <div className="flex items-center gap-1.5 cursor-pointer" onClick={() => handleSwitchTab('Dashboard')}>
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-tripo-yellow-1 to-amber-500 flex items-center justify-center shadow-[0_0_8px_rgba(250,204,21,0.25)]">
              <Sparkles size={13} className="text-black fill-black" />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs font-black tracking-tight text-white">TRIPO</span>
              <span className="text-[9.5px] font-bold text-tripo-yellow-1">Studio</span>
            </div>
          </div>

          <span className="text-tripo-white-10 hidden sm:inline">/</span>

          {/* Active Tab Breadcrumb */}
          <span className="text-xs font-medium text-tripo-gray-300 hidden sm:inline">
            {activeSidebarItem === 'Rigging & Animation' ? 'Rigging & Animation' : activeSidebarItem}
          </span>
        </div>

        {/* Center Section: Navigation Links */}
        <nav className="hidden lg:flex items-center gap-0.5 bg-tripo-gray-2/80 p-0.5 rounded-lg border border-tripo-white-5">
          {topNavItems.map((item) => {
            const isActive = activeSidebarItem === item.tab || (item.tab === 'Rigging & Animation' && (activeSidebarItem === 'Rigging' || activeSidebarItem === 'Animation'));
            return (
              <button
                key={item.tab}
                onClick={() => handleSwitchTab(item.tab)}
                className={cn(
                  'px-2.5 py-0.5 rounded-md text-xs font-medium transition-all duration-150 cursor-pointer',
                  isActive
                    ? 'bg-tripo-yellow-1 text-black font-bold shadow-xs'
                    : 'text-tripo-gray-300 hover:text-white hover:bg-tripo-white-5'
                )}
                id={`top-nav-item-${item.tab.toLowerCase().replace(/\s+/g, '-')}`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Right Section: Clean Actions */}
        <div className="flex items-center gap-2">
          {/* New 3D Generation CTA */}
          <button
            onClick={() => handleSwitchTab('3D Gen')}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-tripo-yellow-1 hover:bg-yellow-400 text-black font-bold text-xs shadow-xs transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            id="top-bar-new-model-btn"
          >
            <Plus size={12} className="stroke-[3]" />
            <span>New Model</span>
          </button>

          {/* Settings Icon */}
          <button
            onClick={() => handleSwitchTab('Settings')}
            className="p-1.5 rounded-md text-tripo-gray-400 hover:text-white hover:bg-tripo-white-5 transition-colors cursor-pointer"
            title="Settings"
          >
            <Settings size={15} />
          </button>

          {/* User Profile Avatar */}
          <div
            className="w-6 h-6 rounded-md bg-tripo-gray-3 border border-tripo-white-10 flex items-center justify-center text-[10px] font-bold text-white shadow-inner cursor-pointer"
            onClick={() => handleSwitchTab('Settings')}
            title="Account"
          >
            AI
          </div>
        </div>
      </header>

      {/* ── Mobile Menu Dropdown ── */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-tripo-gray-2 border-b border-tripo-white-5 p-2 flex flex-col gap-0.5 z-40 animate-fadeIn shadow-xl">
          {[...primaryStudioTools, ...bottomStudioTools].map((tool) => {
            const Icon = tool.icon;
            const isActive = activeSidebarItem === tool.id || (tool.id === 'Rigging & Animation' && (activeSidebarItem === 'Rigging' || activeSidebarItem === 'Animation'));
            return (
              <button
                key={tool.id}
                onClick={() => handleSwitchTab(tool.id)}
                className={cn(
                  'flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer',
                  isActive
                    ? 'bg-tripo-yellow-1 text-black font-bold'
                    : 'text-tripo-gray-300 hover:text-white hover:bg-tripo-white-5'
                )}
              >
                <Icon size={15} />
                <span>{tool.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Main Workspace Body: Slim Icon Rail + Viewport ── */}
      <div className="flex flex-1 min-h-0 min-w-0 bg-tripo-gray-1" id="creative-layout-body">
        {/* ── Compact Tripo Left Navigation Rail (w-14 / 56px) ── */}
        <aside
          className="w-14 shrink-0 bg-tripo-gray-2 border-r border-tripo-white-5 flex flex-col justify-between items-center py-1.5 select-none z-20 min-h-0"
          id="tripo-slim-rail"
        >
          {/* Top Primary 3D Generation Tools */}
          <div className="flex flex-col items-center gap-0.5 w-full px-1">
            {primaryStudioTools.map((tool) => {
              const Icon = tool.icon;
              const isActive = activeSidebarItem === tool.id || (tool.id === 'Rigging & Animation' && (activeSidebarItem === 'Rigging' || activeSidebarItem === 'Animation'));
              return (
                <button
                  key={tool.id}
                  onClick={() => handleSwitchTab(tool.id)}
                  className={cn(
                    'group relative w-full flex flex-col items-center justify-center py-1.5 rounded-lg transition-all duration-150 cursor-pointer',
                    isActive
                      ? 'bg-tripo-yellow-1/10 text-tripo-yellow-1 shadow-xs'
                      : 'text-tripo-gray-400 hover:text-white hover:bg-tripo-white-5'
                  )}
                  title={tool.label}
                  id={`rail-btn-${tool.id.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  {/* Left active indicator bar */}
                  {isActive && (
                    <div className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r-full bg-tripo-yellow-1 shadow-[0_0_5px_rgba(250,204,21,0.8)]" />
                  )}
                  <Icon
                    size={15}
                    className={cn(
                      'transition-transform group-hover:scale-105 duration-150',
                      isActive ? 'text-tripo-yellow-1 stroke-[2.2]' : 'text-tripo-gray-400 group-hover:text-white'
                    )}
                  />
                  <span className={cn(
                    'text-[8px] mt-0.5 font-semibold tracking-tight transition-colors leading-tight',
                    isActive ? 'text-tripo-yellow-1 font-bold' : 'text-tripo-gray-400 group-hover:text-tripo-200'
                  )}>
                    {tool.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Divider */}
          <div className="w-6 h-px bg-tripo-white-5 my-0.5" />

          {/* Bottom Utility & Library Tools */}
          <div className="flex flex-col items-center gap-0.5 w-full px-1">
            {bottomStudioTools.map((tool) => {
              const Icon = tool.icon;
              const isActive = activeSidebarItem === tool.id;
              return (
                <button
                  key={tool.id}
                  onClick={() => handleSwitchTab(tool.id)}
                  className={cn(
                    'group relative w-full flex flex-col items-center justify-center py-1.5 rounded-lg transition-all duration-150 cursor-pointer',
                    isActive
                      ? 'bg-tripo-yellow-1/10 text-tripo-yellow-1 shadow-xs'
                      : 'text-tripo-gray-400 hover:text-white hover:bg-tripo-white-5'
                  )}
                  title={tool.label}
                  id={`rail-btn-${tool.id.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  {isActive && (
                    <div className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r-full bg-tripo-yellow-1 shadow-[0_0_5px_rgba(250,204,21,0.8)]" />
                  )}
                  <Icon
                    size={15}
                    className={cn(
                      'transition-transform group-hover:scale-105 duration-150',
                      isActive ? 'text-tripo-yellow-1 stroke-[2.2]' : 'text-tripo-gray-400 group-hover:text-white'
                    )}
                  />
                  <span className={cn(
                    'text-[8px] mt-0.5 font-semibold tracking-tight transition-colors leading-tight',
                    isActive ? 'text-tripo-yellow-1 font-bold' : 'text-tripo-gray-400 group-hover:text-tripo-200'
                  )}>
                    {tool.label}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* ── Main Viewport: Render the exact active tab component cleanly ── */}
        <main ref={mainRef} className="flex-1 flex flex-col min-w-0 bg-tripo-gray-1 overflow-hidden relative" id="creative-main-viewport">
          {/* 1. 3D Gen Mode: GenerationControls + Canvas3D + RightContextPanel */}
          {activeSidebarItem === '3D Gen' && (
            <div className="flex-1 flex flex-col lg:flex-row gap-0 min-h-0 h-full w-full" id="persistent-3d-studio-container">
              {/* Left Generation Controls Panel */}
              <div className="w-full lg:w-72 xl:w-80 shrink-0 h-full border-r border-tripo-white-5 bg-tripo-gray-2 transition-all duration-200 overflow-y-auto">
                <GenerationControls />
              </div>

              {/* Center: 3D Viewport Canvas */}
              <div className="flex-1 min-w-0 min-h-0 flex flex-col relative h-full w-full bg-black/60" id="persistent-3d-canvas-wrapper">
                <Canvas3D isGenerating={isGenerating} />
              </div>

              {/* Right: Contextual Tabs Panel */}
              <div className="hidden lg:flex w-72 xl:w-80 shrink-0 h-full border-l border-tripo-white-5 bg-tripo-gray-2 transition-all duration-200 scrollbar-thin">
                <RightContextPanel
                  assets={assets}
                  selectedAssetId={selectedAssetId}
                  onSelectAsset={handleSelectAsset}
                  onToggleFavorite={handleToggleFavorite}
                  onDeleteAsset={handleDeleteAsset}
                  onAssetUploaded={loadHistory}
                  loading={isLoadingHistory}
                />
              </div>
            </div>
          )}

          {/* 2. Dashboard Tab */}
          {activeSidebarItem === 'Dashboard' && (
            <div className="flex-1 min-h-0 w-full overflow-y-auto bg-tripo-gray-1 p-4 sm:p-6 lg:p-8 animate-fadeIn" id="dashboard-full-view">
              <WorkspaceTab
                history={history ?? []}
                onLoadProject={loadHistoryItem}
                onNavigate={handleSwitchTab}
              />
            </div>
          )}

          {/* 3. Texture Gen Tab */}
          {activeSidebarItem === 'Texture Gen' && (
            <div className="flex-1 min-h-0 w-full h-full animate-fadeIn" id="texture-gen-full-view">
              <TextureGenTab
                activeModel={activeModel}
                onUpdateModel={setActiveModel}
                onNavigate={handleSwitchTab}
              />
            </div>
          )}

          {/* 4. Rigging & Animation Tab */}
          {(activeSidebarItem === 'Rigging & Animation' || activeSidebarItem === 'Rigging' || activeSidebarItem === 'Animation') && (
            <div className="flex-1 min-h-0 w-full h-full animate-fadeIn" id="rigging-anim-full-view">
              <RiggingAnimationTab
                activeModel={activeModel}
                onUpdateModel={setActiveModel}
                onNavigate={handleSwitchTab}
              />
            </div>
          )}

          {/* 5. Remesh Tab */}
          {activeSidebarItem === 'Remesh' && (
            <div className="flex-1 min-h-0 w-full h-full animate-fadeIn" id="remesh-full-view">
              <RemeshTab
                activeModel={activeModel}
                onUpdateModel={setActiveModel}
                onNavigate={handleSwitchTab}
              />
            </div>
          )}

          {/* 6. My Assets Tab */}
          {activeSidebarItem === 'My Assets' && (
            <div className="flex-1 min-h-0 w-full overflow-y-auto bg-tripo-gray-1 p-4 sm:p-6 lg:p-8 animate-fadeIn" id="my-assets-full-view">
              <MyAssetsTab
                history={history ?? []}
                onLoadProject={loadHistoryItem}
                onDeleteProject={deleteHistoryItem}
                onToggleFavorite={toggleFavoriteItem}
              />
            </div>
          )}

          {/* 7. Models Tab */}
          {activeSidebarItem === 'Models' && (
            <div className="flex-1 min-h-0 w-full overflow-y-auto bg-tripo-gray-1 p-4 sm:p-6 lg:p-8 animate-fadeIn" id="models-full-view">
              <ModelsTab />
            </div>
          )}

          {/* 8. Favorites Tab */}
          {activeSidebarItem === 'Favorites' && (
            <div className="flex-1 min-h-0 w-full overflow-y-auto bg-tripo-gray-1 p-4 sm:p-6 lg:p-8 animate-fadeIn" id="favorites-full-view">
              <FavoritesTab
                history={history ?? []}
                onLoadProject={loadHistoryItem}
                onRemoveFavorite={toggleFavoriteItem}
                onDeleteProject={deleteHistoryItem}
              />
            </div>
          )}

          {/* 9. API Access Tab */}
          {activeSidebarItem === 'API Access' && (
            <div className="flex-1 min-h-0 w-full overflow-y-auto bg-tripo-gray-1 p-4 sm:p-6 lg:p-8 animate-fadeIn" id="api-access-full-view">
              <ApiAccessTab />
            </div>
          )}

          {/* 10. Settings Tab */}
          {activeSidebarItem === 'Settings' && (
            <div className="flex-1 min-h-0 w-full overflow-y-auto bg-tripo-gray-1 p-4 sm:p-6 lg:p-8 animate-fadeIn" id="settings-full-view">
              <WorkspaceSettingsTab />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
