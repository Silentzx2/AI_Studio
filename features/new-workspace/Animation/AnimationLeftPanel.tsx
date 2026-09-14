'use client';

import React, { useRef } from 'react';
import {
  Box,
  Upload,
  Plus,
  Search,
  Play,
  Pause,
  Layers,
  FileCode,
  Check,
  CheckCircle2,
  FolderOpen,
} from 'lucide-react';
import { useWorkspace } from '../store/WorkspaceContext';
import { useAnimationStore } from '@/stores/useAnimationStore';
import { toast } from 'sonner';

import { useViewerStore } from '@/stores/useViewerStore';

const SAMPLE_PROJECT_MODELS = [
  { id: 'model-char', name: 'character.glb', size: '2.4 MB', vertices: '48.5k', format: 'GLB', isRigged: true },
  { id: 'model-robot', name: 'robot.fbx', size: '3.1 MB', vertices: '32.1k', format: 'FBX', isRigged: true },
  { id: 'model-creature', name: 'creature.glb', size: '4.8 MB', vertices: '64.8k', format: 'GLB', isRigged: false },
  { id: 'model-human', name: 'human.obj', size: '1.9 MB', vertices: '28.3k', format: 'OBJ', isRigged: false },
];

export const AnimationLeftPanel: React.FC = () => {
  const { assets, selectedAssetId, selectAsset, currentAsset, addAsset } = useWorkspace();
  const viewerStore = useViewerStore();
  const {
    animations,
    currentAnimationId,
    setCurrentAnimationId,
    isPlaying,
    togglePlay,
    selectedCategory,
    setSelectedCategory,
    searchQuery,
    setSearchQuery,
    addAnimation,
  } = useAnimationStore();

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Combine real workspace assets with fallback sample assets if workspace has few
  const displayModels = assets.length > 0
    ? assets.map((a) => ({
        id: a.id,
        name: a.name || a.source?.filename || 'model.glb',
        size: a.faces ? `${Math.round((a.faces * 50) / 1024)} KB` : '2.4 MB',
        vertices: a.vertices ? `${(a.vertices / 1000).toFixed(1)}k` : '48.5k',
        format: (a.format || 'GLB').toUpperCase(),
        isRigged: Boolean(a.artifacts?.source || a.tags?.includes('rigged') || true),
      }))
    : SAMPLE_PROJECT_MODELS;

  const currentModelName = currentAsset?.name || viewerStore.loadedModelName || 'character.glb';
  const realVerts = currentAsset?.vertices || viewerStore.modelStats?.vertices || 0;
  const realFaces = currentAsset?.faces || currentAsset?.triangles || viewerStore.modelStats?.triangles || 0;
  const currentModelDetails = realFaces > 0
    ? `${realFaces.toLocaleString()} polys • ${realVerts > 0 ? (realVerts / 1000).toFixed(1) + 'k verts' : ''}`
    : '3D Mesh Target';

  const handleSelectModel = (model: { id: string; name: string; format?: string; vertices?: string }) => {
    const existing = assets.find((a) => a.id === model.id);
    if (existing) {
      selectAsset(existing.id);
    } else {
      const isRobot = model.name.toLowerCase().includes('robot');
      const isCreature = model.name.toLowerCase().includes('creature');
      const isHuman = model.name.toLowerCase().includes('human');
      const newAsset = {
        id: model.id,
        name: model.name,
        category: 'mesh' as const,
        thumbnail: '',
        meshType: 'custom' as const,
        faces: isCreature ? 64800 : isRobot ? 32100 : isHuman ? 28300 : 48500,
        vertices: isCreature ? 50000 : isRobot ? 25000 : isHuman ? 22000 : 35000,
        triangles: isCreature ? 64800 : isRobot ? 32100 : isHuman ? 28300 : 48500,
        topology: 'Triangle' as const,
        format: (model.format || 'GLB') as any,
        dateCreated: new Date().toISOString(),
        tags: ['character', 'rigged'],
        source: {
          filename: model.name,
          subfolder: 'samples',
          type: 'local',
          localUrl: '',
          viewUrl: '',
        },
      };
      addAsset(newAsset);
      selectAsset(newAsset.id);
    }
  };

  // Filter animations by category and search
  const categories = ['All Animations', 'Idle', 'Walk', 'Run', 'Jump', 'Actions', 'Custom'] as const;

  const filteredAnimations = animations.filter((clip) => {
    const matchesCategory =
      selectedCategory === 'All Animations' || clip.category === selectedCategory;
    const matchesSearch =
      !searchQuery || clip.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const getCategoryCount = (cat: string) => {
    if (cat === 'All Animations') return animations.length;
    return animations.filter((a) => a.category === cat).length;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const newAsset = {
      id: `imported-${Date.now()}`,
      name: file.name,
      category: 'mesh' as const,
      thumbnail: '',
      meshType: 'custom' as const,
      faces: 48500,
      vertices: 35000,
      triangles: 48500,
      topology: 'Triangle' as const,
      format: file.name.endsWith('.fbx') ? ('FBX' as const) : ('GLB' as const),
      dateCreated: new Date().toISOString(),
      tags: ['imported', 'character'],
      source: {
        filename: file.name,
        subfolder: 'imports',
        type: 'local',
        localUrl: url,
        viewUrl: url,
      },
    };
    addAsset(newAsset);
    selectAsset(newAsset.id);
    toast.success(`Imported ${file.name}`, { description: 'Loaded into Animation Studio viewport' });
  };

  const handleAddCustomAnimation = () => {
    const name = window.prompt('Enter new animation clip name:', 'New Custom Motion');
    if (!name?.trim()) return;
    const newClip = {
      id: `anim-custom-${Date.now()}`,
      name: name.trim(),
      category: 'Custom' as const,
      duration: 2.0,
      fps: 24,
      keyframesCount: 48,
    };
    addAnimation(newClip);
    toast.success(`Created ${name.trim()}`, { description: 'Added to Custom animation tracks' });
  };

  return (
    <div className="w-[300px] h-full bg-[#121418] border-r border-white/[0.08] flex flex-col flex-shrink-0 select-none overflow-hidden">
      {/* Hidden File Input for Replace / Import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".glb,.gltf,.fbx,.obj"
        className="hidden"
        onChange={handleFileUpload}
      />

      <div className="flex-1 overflow-y-auto divide-y divide-white/[0.06] scrollbar-thin scrollbar-thumb-white/10">
        {/* SECTION 1: Active Model & Assets Card */}
        <div className="p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-300 tracking-wide flex items-center gap-1.5">
              <Box className="w-3.5 h-3.5 text-[#F9CF00]" />
              Model & Assets
            </span>
            <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
              Active Target
            </span>
          </div>

          {/* Active Model Card */}
          <div className="p-2.5 bg-[#17191F] border border-white/[0.08] rounded-xl hover:border-white/[0.15] transition-all">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-[#0F1014] border border-white/[0.06] flex items-center justify-center flex-shrink-0 overflow-hidden relative group">
                <Box className="w-6 h-6 text-[#F9CF00] transition-transform group-hover:scale-110" />
                <div className="absolute inset-0 bg-[#F9CF00]/5 pointer-events-none" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-bold text-white truncate">{currentModelName}</h4>
                <p className="text-[11px] text-zinc-400 truncate mt-0.5 font-mono">
                  {currentModelDetails}
                </p>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-2 py-0.5 text-[10px] font-semibold bg-[#22252C] hover:bg-[#2B2F38] text-zinc-200 border border-white/[0.08] rounded-md transition-colors cursor-pointer"
                  >
                    Replace
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-2 py-0.5 text-[10px] font-semibold bg-[#22252C] hover:bg-[#2B2F38] text-zinc-200 border border-white/[0.08] rounded-md transition-colors flex items-center gap-0.5 cursor-pointer"
                  >
                    <Plus className="w-2.5 h-2.5" /> Import
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 2: Model List */}
        <div className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
              Model List ({displayModels.length})
            </span>
          </div>

          <div className="space-y-1">
            {displayModels.map((model) => {
              const isSelected =
                selectedAssetId === model.id ||
                (!selectedAssetId && model.name === currentModelName);

              return (
                <button
                  key={model.id}
                  onClick={() => handleSelectModel(model)}
                  className={`w-full p-2 rounded-xl text-left transition-all flex items-center justify-between gap-2 border cursor-pointer ${
                    isSelected
                      ? 'bg-[#1D2028] border-[#F9CF00]/50 text-white shadow-sm'
                      : 'bg-[#15171D] border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-[#1A1C23]'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        isSelected ? 'bg-[#F9CF00]' : 'bg-zinc-600'
                      }`}
                    />
                    <div className="truncate">
                      <div className={`text-xs truncate ${isSelected ? 'font-bold text-white' : 'font-medium'}`}>
                        {model.name}
                      </div>
                      <div className="text-[10px] text-zinc-500">{model.vertices} verts</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-black/40 text-zinc-400 border border-white/[0.04]">
                      {model.format}
                    </span>
                    {isSelected && (
                      <Check className="w-3.5 h-3.5 text-[#F9CF00] flex-shrink-0" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* SECTION 3: Animation Library */}
        <div className="p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
              Animation Library
            </span>
            <button
              onClick={handleAddCustomAnimation}
              className="px-2 py-0.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-[#F9CF00] hover:text-[#ffe033] text-[10px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Plus className="w-3 h-3" /> Add
            </button>
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search animations..."
              className="w-full pl-8 pr-2.5 py-1.5 rounded-lg bg-[#17191F] border border-white/[0.08] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#F9CF00]/50"
            />
          </div>

          {/* Category Filter Pills */}
          <div className="flex flex-wrap gap-1">
            {categories.map((cat) => {
              const count = getCategoryCount(cat);
              const isActive = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                    isActive
                      ? 'bg-[#F9CF00] text-black font-bold'
                      : 'bg-[#181A20] text-zinc-400 hover:text-white hover:bg-[#20222A] border border-white/[0.04]'
                  }`}
                >
                  <span>{cat}</span>
                  <span className={`text-[9px] px-1 rounded-full ${isActive ? 'bg-black/20 text-black' : 'bg-white/[0.08] text-zinc-500'}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Animation Clips List */}
          <div className="space-y-1 pt-1">
            {filteredAnimations.map((clip) => {
              const isActive = currentAnimationId === clip.id;
              return (
                <div
                  key={clip.id}
                  onClick={() => setCurrentAnimationId(clip.id)}
                  className={`w-full p-2 rounded-xl text-left transition-all flex items-center justify-between border cursor-pointer ${
                    isActive
                      ? 'bg-[#1E2129] border-[#F9CF00]/50 text-white shadow-sm'
                      : 'bg-[#15171D] border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-[#191B22]'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!isActive) setCurrentAnimationId(clip.id);
                        togglePlay();
                      }}
                      className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                        isActive && isPlaying
                          ? 'bg-[#F9CF00] text-black'
                          : 'bg-[#22252C] text-zinc-300 hover:bg-[#2A2E38]'
                      }`}
                    >
                      {isActive && isPlaying ? (
                        <Pause className="w-3 h-3 fill-current" />
                      ) : (
                        <Play className="w-3 h-3 fill-current ml-0.5" />
                      )}
                    </button>
                    <div className="truncate">
                      <div className={`text-xs truncate ${isActive ? 'font-bold text-white' : 'font-medium'}`}>
                        {clip.name}
                      </div>
                      <div className="text-[10px] text-zinc-500 flex items-center gap-1.5 mt-0.5">
                        <span>{clip.category}</span>
                        <span>•</span>
                        <span>{clip.duration.toFixed(1)}s</span>
                      </div>
                    </div>
                  </div>
                  {isActive && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#F9CF00]/10 text-[#F9CF00] border border-[#F9CF00]/20 flex-shrink-0">
                      Active
                    </span>
                  )}
                </div>
              );
            })}
            {filteredAnimations.length === 0 && (
              <div className="py-6 text-center text-xs text-zinc-500">
                No animations found
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
