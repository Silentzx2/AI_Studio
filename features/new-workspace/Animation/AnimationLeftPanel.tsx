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
import { normalizeModelAsset } from '../types';

import { useViewerStore } from '@/stores/useViewerStore';

export const AnimationLeftPanel: React.FC = () => {
  const { assets, selectedAssetId, selectAsset, currentAsset, addAsset, deleteAsset } = useWorkspace();
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

  // Purely real workspace assets — zero mock or placeholder models
  const displayModels = assets.map((a) => {
    const rawFaces = a.faces || a.triangles || 0;
    const rawVerts = a.vertices || 0;
    const vertsDisplay = rawVerts > 0
      ? `${(rawVerts / 1000).toFixed(1)}k`
      : rawFaces > 0
      ? `${(rawFaces / 1000).toFixed(1)}k`
      : '—';

    return {
      id: a.id,
      name: a.name || a.source?.filename || 'model.glb',
      size: rawFaces > 0 ? `${Math.round((rawFaces * 50) / 1024)} KB` : '—',
      vertices: vertsDisplay,
      format: (a.format || 'GLB').toUpperCase(),
      isRigged: Boolean(a.tags?.includes('rigged')),
    };
  });

  const currentModelName = currentAsset?.name || viewerStore.loadedModelName || (displayModels[0]?.name ?? '3D Model');
  const realVerts = currentAsset?.vertices || viewerStore.modelStats?.vertices || 0;
  const realFaces = currentAsset?.faces || currentAsset?.triangles || viewerStore.modelStats?.triangles || 0;
  const currentModelDetails = realFaces > 0
    ? `${realFaces.toLocaleString()} polys • ${realVerts > 0 ? (realVerts / 1000).toFixed(1) + 'k verts' : ''}`
    : '3D Mesh Target';

  const handleSelectModel = (model: { id: string }) => {
    selectAsset(model.id);
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const localUrl = URL.createObjectURL(file);
    const tempId = `model-upload-${Date.now()}`;
    const ext = (file.name.split('.').pop() || 'glb').toUpperCase();

    // Instant local asset insertion for 0ms preview
    const tempAsset = {
      id: tempId,
      name: file.name,
      category: 'mesh' as const,
      thumbnail: '',
      meshType: 'custom' as const,
      faces: 0,
      vertices: 0,
      triangles: 0,
      topology: 'Triangle' as const,
      format: ext as any,
      dateCreated: new Date().toISOString(),
      tags: ['uploaded'],
      source: {
        filename: file.name,
        subfolder: 'models',
        type: 'local' as const,
        localUrl,
        viewUrl: localUrl,
      },
    };
    addAsset(tempAsset);
    selectAsset(tempId);
    toast.info(`Uploading ${file.name}...`);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/v1/upload/model', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.detail || `Upload failed (${res.status})`);
      }

      const data = await res.json();
      const uploaded = data?.data;
      if (uploaded) {
        const finalAsset = normalizeModelAsset({
          id: uploaded.id || tempId,
          name: file.name,
          category: 'mesh',
          thumbnail: uploaded.thumbnail_url || '',
          meshType: 'custom',
          polygon_count: uploaded.mesh_stats?.polygon_count,
          vertex_count: uploaded.mesh_stats?.vertex_count,
          faces: uploaded.mesh_stats?.polygon_count || 0,
          vertices: uploaded.mesh_stats?.vertex_count || 0,
          triangles: uploaded.mesh_stats?.polygon_count || 0,
          statsAvailable: !!(uploaded.mesh_stats && ((uploaded.mesh_stats.polygon_count ?? 0) > 0 || (uploaded.mesh_stats.vertex_count ?? 0) > 0)),
          topology: uploaded.mesh_stats?.topology || 'Triangle',
          format: (uploaded.format || ext).toUpperCase() as any,
          dimensions: uploaded.mesh_stats?.dimensions,
          boundingBox: uploaded.mesh_stats?.bounding_box,
          objectCount: uploaded.mesh_stats?.object_count,
          componentCount: uploaded.mesh_stats?.component_count,
          materialCount: uploaded.mesh_stats?.material_count,
          meshDetails: uploaded.mesh_stats?.mesh_details,
          dateCreated: new Date().toISOString(),
          tags: ['uploaded'],
          source: {
            filename: uploaded.filename || file.name,
            subfolder: 'models',
            type: 'upload' as const,
            localUrl: uploaded.url,
            viewUrl: uploaded.url,
          },
        });
        deleteAsset(tempId);
        addAsset(finalAsset);
        selectAsset(finalAsset.id);
        toast.success(`Uploaded ${file.name}`, { description: 'Ready for rigging and animation' });
      }
    } catch (err) {
      await deleteAsset(tempId);
      toast.error(`Upload failed for ${file.name}`, { description: 'The temporary preview was removed. Retry the upload when ready.' });
    }
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
    <div className="w-full lg:w-[300px] h-full bg-[hsl(var(--surface-0))] lg:border-r border-white/[0.08] flex flex-col flex-shrink-0 select-none overflow-hidden">
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
              <Box className="w-3.5 h-3.5 text-primary" />
              Model & Assets
            </span>
            <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
              Active Target
            </span>
          </div>

          {/* Active Model Card */}
          <div className="p-2.5 bg-[hsl(var(--surface-1))] border border-white/[0.08] rounded-xl hover:border-white/[0.15] transition-all">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-[hsl(var(--surface-0))] border border-white/[0.06] flex items-center justify-center flex-shrink-0 overflow-hidden relative group">
                <Box className="w-6 h-6 text-primary transition-transform group-hover:scale-110" />
                <div className="absolute inset-0 bg-primary/5 pointer-events-none" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-bold text-white truncate">{currentModelName}</h4>
                <p className="text-[11px] text-zinc-400 truncate mt-0.5 font-mono">
                  {currentModelDetails}
                </p>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-2 py-0.5 text-[10px] font-semibold bg-[hsl(var(--surface-2))] hover:bg-[hsl(var(--surface-3))] text-zinc-200 border border-white/[0.08] rounded-md transition-colors cursor-pointer"
                  >
                    Replace
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-2 py-0.5 text-[10px] font-semibold bg-[hsl(var(--surface-2))] hover:bg-[hsl(var(--surface-3))] text-zinc-200 border border-white/[0.08] rounded-md transition-colors flex items-center gap-0.5 cursor-pointer"
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

          {displayModels.length === 0 ? (
            <div className="p-4 text-center border border-dashed border-white/[0.08] rounded-xl bg-[hsl(var(--surface-1))]/50 my-1">
              <FolderOpen className="w-6 h-6 text-zinc-500 mx-auto mb-2" />
              <div className="text-xs font-bold text-zinc-300">No Models in Project</div>
              <p className="text-[10px] text-zinc-500 mt-1 mb-2.5">
                Upload a 3D model (.glb, .fbx, .obj) to start rigging & animating
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs transition-colors cursor-pointer"
              >
                Upload 3D Model
              </button>
            </div>
          ) : (
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
                        ? 'bg-[hsl(var(--surface-2))] border-primary/50 text-white shadow-sm'
                        : 'bg-[hsl(var(--surface-1))] border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-[hsl(var(--surface-2))]'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          isSelected ? 'bg-primary' : 'bg-zinc-600'
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
                        <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* SECTION 3: Animation Library */}
        <div className="p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
              Animation Library
            </span>
            <button
              onClick={handleAddCustomAnimation}
              className="px-2 py-0.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-primary hover:text-primary/90 text-[10px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Add
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
              className="w-full pl-8 pr-2.5 py-1.5 rounded-lg bg-[hsl(var(--surface-1))] border border-white/[0.08] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-primary/50"
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
                      ? 'bg-primary text-primary-foreground font-bold'
                      : 'bg-[hsl(var(--surface-1))] text-zinc-400 hover:text-white hover:bg-[hsl(var(--surface-2))] border border-white/[0.04]'
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
                      ? 'bg-[hsl(var(--surface-2))] border-primary/50 text-white shadow-sm'
                      : 'bg-[hsl(var(--surface-1))] border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-[hsl(var(--surface-2))]'
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
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-[hsl(var(--surface-2))] text-zinc-300 hover:bg-[hsl(var(--surface-3))]'
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
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 flex-shrink-0">
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
