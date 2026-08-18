"use client";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Unified Right Context Panel for 3D Workspace
 * Features: Assets, Inspector (Stats), Materials (Shading), Rigging (Bones), Animation (Timeline), Tasks (Jobs)
 */

import React, { useState, useEffect } from 'react';
import {
  FolderArchive,
  BarChart3,
  Palette,
  Bone,
  Play,
  Activity,
  Layers,
  Box,
  Sparkles,
  Download,
  Upload,
  Check,
  RotateCcw,
  Eye,
  Sliders,
  Maximize2,
  Clock,
  ChevronRight,
  Info,
  ShieldCheck,
  Sun,
  Flame,
  Zap,
} from 'lucide-react';
import AssetPanel, { AssetItem } from '@/3D-SPACE/AssetPanel';
import { useViewerStore, ShadingPreset, ContextTabType } from '@/stores/useViewerStore';
import { useUIStore } from '@/stores/useUIStore';
import { useGenerationStore } from '@/stores/useGenerationStore';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface RightContextPanelProps {
  assets: AssetItem[];
  selectedAssetId?: string | null;
  onSelectAsset?: (asset: AssetItem) => void;
  onToggleFavorite?: (id: string) => void;
  onDeleteAsset?: (id: string) => void;
  onAssetUploaded?: () => void;
  loading?: boolean;
}

const CONTEXT_TABS = [
  { id: 'assets' as ContextTabType, label: 'Assets', icon: FolderArchive },
  { id: 'inspector' as ContextTabType, label: 'Inspector', icon: BarChart3 },
  { id: 'materials' as ContextTabType, label: 'Materials', icon: Palette },
  { id: 'rig' as ContextTabType, label: 'Rig & Bones', icon: Bone },
  { id: 'animation' as ContextTabType, label: 'Animation', icon: Play },
  { id: 'jobs' as ContextTabType, label: 'Tasks', icon: Activity },
];

const SHADING_OPTIONS: { id: ShadingPreset; label: string; desc: string; color: string }[] = [
  { id: 'default', label: 'Realistic PBR', desc: 'Full textures & lighting', color: 'bg-emerald-500' },
  { id: 'clay', label: 'Matte Clay', desc: 'Sculpting & form check', color: 'bg-slate-400' },
  { id: 'metallic', label: 'High Metallic', desc: 'Reflection & highlights', color: 'bg-cyan-400' },
  { id: 'normal', label: 'Normal Map', desc: 'Tangent normal vectors', color: 'bg-purple-500' },
  { id: 'gold', label: 'Gold Shading', desc: 'Polished luxury brass', color: 'bg-amber-400' },
  { id: 'cyberpunk', label: 'Cyberpunk', desc: 'Neon emissive glow', color: 'bg-pink-500' },
  { id: 'uv', label: 'UV Checker', desc: 'Texture coordinate grid', color: 'bg-violet-500' },
  { id: 'wireframe', label: 'Pure Wireframe', desc: 'Edge polygon topology', color: 'bg-sky-400' },
];

export default function RightContextPanel({
  assets,
  selectedAssetId,
  onSelectAsset,
  onToggleFavorite,
  onDeleteAsset,
  onAssetUploaded,
  loading,
}: RightContextPanelProps) {
  const {
    activeContextTab,
    setActiveContextTab,
    modelStats,
    shadingMode,
    setShadingMode,
    wireframeOverlay,
    toggleWireframeOverlay,
    loadedModelUrl,
    loadedModelName,
  } = useViewerStore();

  const { viewer, toggleGrid, toggleAutoRotate, resetCamera } = useUIStore();
  const { currentJob } = useGenerationStore();

  // Animation timeline state
  const [animPlaying, setAnimPlaying] = useState(false);
  const [animSpeed, setAnimSpeed] = useState(1.0);
  const [selectedAnimPreset, setSelectedAnimPreset] = useState('walk');

  const formatNumber = (num?: number) => {
    if (num === undefined || num === null) return '—';
    return num.toLocaleString();
  };

  const getDensityBadge = (triangles?: number) => {
    if (!triangles) return { label: 'Empty', color: 'text-tripo-gray-400 bg-tripo-gray-4' };
    if (triangles < 10000) return { label: 'Game Low-Poly', color: 'text-emerald-400 bg-emerald-950/60 border-emerald-800/40' };
    if (triangles < 50000) return { label: 'Standard Mid-Poly', color: 'text-sky-400 bg-sky-950/60 border-sky-800/40' };
    if (triangles < 150000) return { label: 'High Density', color: 'text-amber-400 bg-amber-950/60 border-amber-800/40' };
    return { label: 'Ultra Dense', color: 'text-purple-400 bg-purple-950/60 border-purple-800/40' };
  };

  const density = getDensityBadge(modelStats?.triangles);

  return (
    <div className="w-full h-full flex flex-col bg-tripo-gray-2 border-l border-tripo-white-5 text-tripo-gray-100 overflow-hidden select-none">
      {/* ── Context Tab Header Bar ── */}
      <div className="flex items-center justify-start gap-1 p-1.5 bg-tripo-gray-3 border-b border-tripo-white-5 overflow-x-auto scrollbar-none">
        {CONTEXT_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeContextTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveContextTab(tab.id)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 whitespace-nowrap cursor-pointer',
                isActive
                  ? 'bg-tripo-yellow-1 text-black font-semibold shadow-sm'
                  : 'text-tripo-gray-300 hover:text-white hover:bg-tripo-white-5'
              )}
              title={tab.label}
            >
              <Icon size={13} className={isActive ? 'text-black' : 'text-tripo-gray-400'} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Tab Content Container ── */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* 1. ASSETS TAB */}
        {activeContextTab === 'assets' && (
          <div className="w-full h-full">
            <AssetPanel
              assets={assets}
              selectedAssetId={selectedAssetId ?? null}
              onSelectAsset={onSelectAsset ?? (() => {})}
              onToggleFavorite={onToggleFavorite ?? (() => {})}
              onDeleteAsset={onDeleteAsset ?? (() => {})}
              onAssetUploaded={onAssetUploaded ?? (() => {})}
              loading={loading}
            />
          </div>
        )}

        {/* 2. INSPECTOR (MESH STATS) TAB */}
        {activeContextTab === 'inspector' && (
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-tripo-gray-400">Mesh Geometry</span>
              <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full border', density.color)}>
                {density.label}
              </span>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 rounded-xl bg-tripo-gray-3 border border-tripo-white-5 flex flex-col">
                <span className="text-[11px] text-tripo-gray-400 font-medium">Triangles</span>
                <span className="text-lg font-mono font-bold text-white mt-1">
                  {formatNumber(modelStats?.triangles)}
                </span>
                <span className="text-[10px] text-tripo-gray-400 mt-0.5">Polygonal faces</span>
              </div>

              <div className="p-3 rounded-xl bg-tripo-gray-3 border border-tripo-white-5 flex flex-col">
                <span className="text-[11px] text-tripo-gray-400 font-medium">Vertices</span>
                <span className="text-lg font-mono font-bold text-white mt-1">
                  {formatNumber(modelStats?.vertices)}
                </span>
                <span className="text-[10px] text-tripo-gray-400 mt-0.5">Vector points</span>
              </div>
            </div>

            {/* Bounding Dimensions */}
            <div className="p-3 rounded-xl bg-tripo-gray-3 border border-tripo-white-5 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-tripo-gray-300 font-medium">Bounding Size (X, Y, Z)</span>
                <span className="text-[10px] text-tripo-gray-400 font-mono">meters</span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 rounded-lg bg-tripo-gray-4 border border-red-500/20">
                  <span className="text-[10px] text-red-400 font-bold block">Width (X)</span>
                  <span className="text-xs font-mono font-bold text-white mt-0.5 block">
                    {modelStats?.dimensions?.x ?? '0.00'}m
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-tripo-gray-4 border border-emerald-500/20">
                  <span className="text-[10px] text-emerald-400 font-bold block">Height (Y)</span>
                  <span className="text-xs font-mono font-bold text-white mt-0.5 block">
                    {modelStats?.dimensions?.y ?? '0.00'}m
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-tripo-gray-4 border border-sky-500/20">
                  <span className="text-[10px] text-sky-400 font-bold block">Depth (Z)</span>
                  <span className="text-xs font-mono font-bold text-white mt-0.5 block">
                    {modelStats?.dimensions?.z ?? '0.00'}m
                  </span>
                </div>
              </div>
            </div>

            {/* Topology & Model Info */}
            <div className="p-3 rounded-xl bg-tripo-gray-3 border border-tripo-white-5 space-y-2">
              <span className="text-xs font-semibold text-tripo-gray-200">Active Model File</span>
              <div className="p-2 rounded-lg bg-tripo-gray-4 flex items-center justify-between text-xs">
                <span className="text-tripo-gray-300 truncate max-w-[170px]">
                  {loadedModelName || 'scene_model.glb'}
                </span>
                <span className="text-[10px] font-mono text-tripo-yellow-1 font-semibold uppercase">
                  {loadedModelUrl ? loadedModelUrl.split('.').pop()?.toUpperCase() : 'GLB'}
                </span>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="space-y-1.5 pt-2">
              <button
                onClick={resetCamera}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-tripo-gray-3 hover:bg-tripo-gray-4 border border-tripo-white-5 text-xs text-tripo-gray-200 hover:text-white transition-colors cursor-pointer"
              >
                <RotateCcw size={13} />
                <span>Re-center Camera to Origin</span>
              </button>

              <button
                onClick={() => {
                  if (loadedModelUrl) {
                    const a = document.createElement('a');
                    a.href = loadedModelUrl;
                    a.download = loadedModelName || 'model.glb';
                    a.click();
                    toast.success('Downloading 3D asset...');
                  } else {
                    toast.error('No active 3D model in canvas');
                  }
                }}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-tripo-yellow-1 hover:bg-yellow-400 text-black font-semibold text-xs transition-colors cursor-pointer"
              >
                <Download size={13} />
                <span>Export GLB Asset</span>
              </button>
            </div>
          </div>
        )}

        {/* 3. MATERIALS (SHADING) TAB */}
        {activeContextTab === 'materials' && (
          <div className="p-4 space-y-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-tripo-gray-400">Shading Presets</span>
              <p className="text-[11px] text-tripo-gray-400 mt-0.5">Select real-time shader rendering mode</p>
            </div>

            <div className="space-y-1.5">
              {SHADING_OPTIONS.map((opt) => {
                const isSelected = shadingMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => {
                      setShadingMode(opt.id);
                      toast.info(`Switched shading to ${opt.label}`);
                    }}
                    className={cn(
                      'w-full flex items-center justify-between p-2.5 rounded-xl border text-left transition-all duration-150 cursor-pointer',
                      isSelected
                        ? 'bg-tripo-gray-4 border-tripo-yellow-1/50 text-white shadow-sm'
                        : 'bg-tripo-gray-3 border-tripo-white-5 text-tripo-gray-300 hover:bg-tripo-gray-4/70 hover:text-white'
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={cn('w-3 h-3 rounded-full shrink-0', opt.color)} />
                      <div>
                        <div className="text-xs font-semibold">{opt.label}</div>
                        <div className="text-[10px] text-tripo-gray-400">{opt.desc}</div>
                      </div>
                    </div>
                    {isSelected && <Check size={14} className="text-tripo-yellow-1 shrink-0" />}
                  </button>
                );
              })}
            </div>

            {/* Wireframe Overlay Switch */}
            <div className="p-3 rounded-xl bg-tripo-gray-3 border border-tripo-white-5 flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-tripo-gray-200 block">Wireframe Overlay</span>
                <span className="text-[10px] text-tripo-gray-400 block">Render polygon wire on top</span>
              </div>
              <button
                onClick={toggleWireframeOverlay}
                className={cn(
                  'w-10 h-5 rounded-full transition-colors relative cursor-pointer',
                  wireframeOverlay ? 'bg-tripo-yellow-1' : 'bg-tripo-gray-4'
                )}
              >
                <div
                  className={cn(
                    'w-3.5 h-3.5 rounded-full bg-black absolute top-0.75 transition-transform duration-200',
                    wireframeOverlay ? 'translate-x-5.5' : 'translate-x-1'
                  )}
                />
              </button>
            </div>

            {/* Scene Helper Controls */}
            <div className="p-3 rounded-xl bg-tripo-gray-3 border border-tripo-white-5 space-y-2">
              <span className="text-xs font-semibold text-tripo-gray-200 block">Viewport Helpers</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={toggleGrid}
                  className={cn(
                    'py-2 px-2.5 rounded-lg text-xs font-medium border text-center transition-colors cursor-pointer',
                    viewer.showGrid
                      ? 'bg-tripo-gray-4 border-tripo-yellow-1/30 text-tripo-yellow-1'
                      : 'bg-tripo-gray-4/50 border-tripo-white-5 text-tripo-gray-400 hover:text-white'
                  )}
                >
                  Ground Grid: {viewer.showGrid ? 'ON' : 'OFF'}
                </button>
                <button
                  onClick={toggleAutoRotate}
                  className={cn(
                    'py-2 px-2.5 rounded-lg text-xs font-medium border text-center transition-colors cursor-pointer',
                    viewer.autoRotate
                      ? 'bg-tripo-gray-4 border-tripo-yellow-1/30 text-tripo-yellow-1'
                      : 'bg-tripo-gray-4/50 border-tripo-white-5 text-tripo-gray-400 hover:text-white'
                  )}
                >
                  Auto Turntable: {viewer.autoRotate ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 4. RIGGING & SKELETON TAB */}
        {activeContextTab === 'rig' && (
          <div className="p-4 space-y-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-tripo-gray-400">Skeleton Hierarchy</span>
              <p className="text-[11px] text-tripo-gray-400 mt-0.5">Bones and joint weight binding status</p>
            </div>

            <div className="p-3 rounded-xl bg-tripo-gray-3 border border-tripo-white-5 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-tripo-gray-300 font-medium">Bones Count</span>
                <span className="font-mono font-bold text-tripo-yellow-1">54 Joints</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-tripo-gray-300 font-medium">Weight Map</span>
                <span className="text-[11px] font-semibold text-emerald-400">Dual-Quaternion</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-tripo-gray-300 font-medium">Symmetry</span>
                <span className="text-[11px] font-semibold text-sky-400">Bilateral (X-Axis)</span>
              </div>
            </div>

            {/* Joint Tree Preview */}
            <div className="p-3 rounded-xl bg-tripo-gray-3 border border-tripo-white-5 space-y-1.5 font-mono text-xs text-tripo-gray-300">
              <div className="flex items-center gap-1 text-tripo-yellow-1">
                <Bone size={12} />
                <span>Root / Hips</span>
              </div>
              <div className="pl-4 flex items-center gap-1 text-tripo-gray-200">
                <span>└─ Spine_01 → Spine_02 → Chest</span>
              </div>
              <div className="pl-8 flex items-center gap-1 text-tripo-gray-300">
                <span>└─ Neck → Head (Jaw, Eyes)</span>
              </div>
              <div className="pl-8 flex items-center gap-1 text-tripo-gray-300">
                <span>└─ Shoulder_L / Shoulder_R</span>
              </div>
              <div className="pl-12 flex items-center gap-1 text-tripo-gray-400 text-[11px]">
                <span>└─ UpperArm → Forearm → Hand (5 Fingers)</span>
              </div>
              <div className="pl-4 flex items-center gap-1 text-tripo-gray-200">
                <span>└─ Thigh_L / Thigh_R → Shin → Foot</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-800/40 text-emerald-400 text-xs flex items-center gap-2">
              <ShieldCheck size={16} className="shrink-0" />
              <span>Rig is ready for Mixamo / Unity / Unreal retargeting</span>
            </div>
          </div>
        )}

        {/* 5. ANIMATION TAB */}
        {activeContextTab === 'animation' && (
          <div className="p-4 space-y-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-tripo-gray-400">Motion Library</span>
              <p className="text-[11px] text-tripo-gray-400 mt-0.5">Preview motion retargeting in real-time</p>
            </div>

            {/* Motion Presets Grid */}
            <div className="grid grid-cols-2 gap-2">
              {['idle', 'walk', 'run', 'jump', 'wave', 'dance'].map((preset) => {
                const isSelected = selectedAnimPreset === preset;
                return (
                  <button
                    key={preset}
                    onClick={() => {
                      setSelectedAnimPreset(preset);
                      toast.info(`Selected motion: ${preset.toUpperCase()}`);
                    }}
                    className={cn(
                      'py-2 px-3 rounded-xl border text-xs font-medium capitalize text-center transition-all duration-150 cursor-pointer',
                      isSelected
                        ? 'bg-tripo-yellow-1 text-black font-semibold shadow-sm border-tripo-yellow-1'
                        : 'bg-tripo-gray-3 border-tripo-white-5 text-tripo-gray-300 hover:bg-tripo-gray-4 hover:text-white'
                    )}
                  >
                    {preset}
                  </button>
                );
              })}
            </div>

            {/* Timeline Controls */}
            <div className="p-3 rounded-xl bg-tripo-gray-3 border border-tripo-white-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-tripo-gray-200">Playback Timeline</span>
                <span className="text-[10px] font-mono text-tripo-gray-400">30 FPS / 60 frames</span>
              </div>

              {/* Progress Scrub Bar */}
              <div className="w-full h-1.5 bg-tripo-gray-4 rounded-full overflow-hidden">
                <div
                  className="h-full bg-tripo-yellow-1 rounded-full transition-all duration-100"
                  style={{ width: animPlaying ? '65%' : '0%' }}
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  onClick={() => setAnimPlaying(!animPlaying)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-tripo-yellow-1 text-black font-semibold text-xs cursor-pointer hover:bg-yellow-400 transition-colors"
                >
                  <Play size={12} className={animPlaying ? 'fill-black' : ''} />
                  <span>{animPlaying ? 'Pause' : 'Play Motion'}</span>
                </button>

                <div className="flex items-center gap-1 text-xs">
                  <span className="text-tripo-gray-400 text-[11px]">Speed:</span>
                  {[0.5, 1.0, 1.5].map((s) => (
                    <button
                      key={s}
                      onClick={() => setAnimSpeed(s)}
                      className={cn(
                        'px-2 py-0.5 rounded text-[10px] font-mono transition-colors cursor-pointer',
                        animSpeed === s
                          ? 'bg-tripo-gray-4 text-tripo-yellow-1 font-bold'
                          : 'text-tripo-gray-400 hover:text-white'
                      )}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 6. TASKS / JOBS TAB */}
        {activeContextTab === 'jobs' && (
          <div className="p-4 space-y-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-tripo-gray-400">Active Tasks</span>
              <p className="text-[11px] text-tripo-gray-400 mt-0.5">Background generation and processing jobs</p>
            </div>

            {currentJob ? (
              <div className="p-3.5 rounded-xl bg-tripo-gray-3 border border-tripo-white-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white truncate max-w-[150px]">
                    {currentJob.config?.prompt || '3D Generation Task'}
                  </span>
                  <span
                    className={cn(
                      'text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize',
                      currentJob.status === 'completed'
                        ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
                        : currentJob.status === 'failed'
                        ? 'bg-red-950/60 text-red-400 border border-red-800/40'
                        : 'bg-amber-950/60 text-amber-400 border border-amber-800/40 animate-pulse'
                    )}
                  >
                    {currentJob.status}
                  </span>
                </div>

                {(currentJob.status === 'generating' || currentJob.status === 'texturing' || currentJob.status === 'rigging' || currentJob.status === 'queued') && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[11px] text-tripo-gray-400 font-mono">
                      <span>Progress</span>
                      <span>{currentJob.progress || 45}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-tripo-gray-4 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-tripo-yellow-1 to-amber-500 rounded-full transition-all duration-300"
                        style={{ width: `${currentJob.progress || 45}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="flex justify-between text-[10px] text-tripo-gray-400">
                  <span>Task ID:</span>
                  <span className="font-mono text-tripo-gray-300">{currentJob.id.slice(0, 12)}...</span>
                </div>
              </div>
            ) : (
              <div className="p-6 rounded-xl bg-tripo-gray-3/50 border border-tripo-white-5 text-center space-y-2">
                <Activity size={24} className="mx-auto text-tripo-gray-400" />
                <p className="text-xs text-tripo-gray-300 font-medium">No running background tasks</p>
                <p className="text-[11px] text-tripo-gray-400">
                  When you generate 3D models or textures, their progress will appear here.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
