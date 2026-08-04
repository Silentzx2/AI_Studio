"use client";

import React, { useState } from 'react';
import {
  Eye, EyeOff, ChevronDown, ChevronUp, Layers,
  Palette, Bone, Play, SlidersHorizontal, Scissors,
  RefreshCw, X, CheckCircle2,
} from 'lucide-react';
import { useProjectStore, type ProjectLayer } from '@/stores/useProjectStore';
import { toast } from 'sonner';

const LAYER_ICONS: Record<ProjectLayer['type'], React.ComponentType<{ className?: string }>> = {
  texture: Palette,
  rigging: Bone,
  animation: Play,
  lod: SlidersHorizontal,
  segmentation: Scissors,
  remesh: RefreshCw,
  part_separation: Scissors,
};

const LAYER_COLORS: Record<ProjectLayer['type'], string> = {
  texture: 'hsl(var(--neon-amber))',
  rigging: 'hsl(var(--neon-purple))',
  animation: 'hsl(var(--neon-cyan))',
  lod: 'hsl(var(--neon-green))',
  segmentation: 'hsl(var(--destructive))',
  remesh: 'hsl(var(--primary))',
  part_separation: 'hsl(var(--neon-amber))',
};

export default function LayerVisibilityPanel() {
  const { currentProject, toggleLayerEnabled, toggleLayerVisible, getEnabledLayers, getVisibleLayers } = useProjectStore();
  const [collapsed, setCollapsed] = useState(false);

  if (!currentProject) return null;

  const layers = currentProject.layers;
  const enabledCount = getEnabledLayers().length;
  const visibleCount = getVisibleLayers().length;

  return (
    <div className="absolute left-4 bottom-4 z-20 bg-[hsl(var(--surface-0))/95 backdrop-blur-md border border-[hsl(var(--border))] rounded-xl shadow-lg overflow-hidden" id="layer-visibility-panel">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-[hsl(var(--surface-1))] transition-colors"
      >
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-[hsl(var(--primary))]" />
          <span className="text-[11px] font-black uppercase tracking-wider text-[hsl(var(--foreground))]">
            Layers
          </span>
          <span className="text-[9px] font-mono font-bold text-[hsl(var(--muted-foreground))] bg-[hsl(var(--surface-2))] px-1.5 py-0.5 rounded">
            {enabledCount}/{layers.length}
          </span>
        </div>
        {collapsed ? <ChevronDown size={14} className="text-[hsl(var(--muted-foreground))]" /> : <ChevronUp size={14} className="text-[hsl(var(--muted-foreground))]" />}
      </button>

      {!collapsed && (
        <div className="border-t border-[hsl(var(--border))] p-2 flex flex-col gap-1 max-h-[240px] overflow-y-auto">
          {layers.length === 0 && (
            <div className="text-[10px] text-[hsl(var(--muted-foreground))] text-center py-3 font-mono">
              No modifications applied yet
            </div>
          )}
          {layers.map((layer) => {
            const Icon = LAYER_ICONS[layer.type] || Layers;
            const color = LAYER_COLORS[layer.type] || 'hsl(var(--muted-foreground))';
            const isEnabled = layer.enabled;
            const isVisible = layer.visible;

            return (
              <div
                key={layer.id}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all ${
                  isEnabled ? 'bg-[hsl(var(--surface-1))]' : 'opacity-40'
                }`}
              >
                <button
                  onClick={() => toggleLayerVisible(layer.id)}
                  className={`p-1 rounded transition-colors ${
                    isVisible
                      ? 'text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))]'
                      : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))]'
                  }`}
                  title={isVisible ? 'Hide layer' : 'Show layer'}
                >
                  {isVisible ? <Eye size={13} /> : <EyeOff size={13} />}
                </button>

                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: color }}
                />

                <Icon className="text-[hsl(var(--muted-foreground))] shrink-0" />

                <span className="flex-1 text-[10px] font-semibold text-[hsl(var(--foreground))] truncate">
                  {layer.name}
                </span>

                <button
                  onClick={() => toggleLayerEnabled(layer.id)}
                  className={`w-7 h-4 rounded-full p-0.5 transition-all cursor-pointer shrink-0 ${
                    isEnabled ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--surface-3))]'
                  }`}
                  title={isEnabled ? 'Disable layer' : 'Enable layer'}
                >
                  <div
                    className={`w-3 h-3 rounded-full bg-black transition-all ${
                      isEnabled ? 'translate-x-3' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            );
          })}

          <div className="border-t border-[hsl(var(--border))] mt-1 pt-1.5 flex items-center justify-between">
            <span className="text-[9px] text-[hsl(var(--muted-foreground))] font-mono">
              {visibleCount} visible
            </span>
            <button
              onClick={() => {
                const allVisible = visibleCount === layers.length;
                layers.forEach((l) => {
                  if (l.visible !== allVisible) {
                    toggleLayerVisible(l.id);
                  }
                });
                toast.info(allVisible ? 'All layers hidden' : 'All layers shown');
              }}
              className="text-[9px] font-bold text-[hsl(var(--primary))] hover:underline"
            >
              {layers.length > 0 && (visibleCount === layers.length ? 'Hide All' : 'Show All')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}