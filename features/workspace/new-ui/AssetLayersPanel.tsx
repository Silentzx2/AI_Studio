"use client";

import React, { useState } from 'react';
import {
  Layers, Palette, Bone, Play, SlidersHorizontal, Scissors,
  RefreshCw, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useProjectStore, type ProjectLayer } from '@/stores/useProjectStore';

const LAYER_ICONS: Record<ProjectLayer['type'], React.ComponentType<{ className?: string; size?: number }>> = {
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

export default function AssetLayersPanel() {
  const { currentProject, toggleLayerEnabled, getEnabledLayers } = useProjectStore();
  const [collapsed, setCollapsed] = useState(false);

  if (!currentProject) return null;

  const layers = currentProject.layers;
  const enabledCount = getEnabledLayers().length;

  return (
    <div className="h-[160px] sm:h-[180px] bg-[hsl(var(--surface-0))] border-t border-[hsl(var(--border))] flex flex-col shrink-0" id="asset-layers-panel">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-between px-4 py-2 border-b border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] shrink-0 hover:bg-[hsl(var(--surface-1))] transition-colors"
      >
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-[hsl(var(--primary))]" />
          <span className="text-[11px] font-black uppercase tracking-wider text-[hsl(var(--foreground))]">
            Asset Layers
          </span>
          <span className="text-[9px] font-mono font-bold text-[hsl(var(--muted-foreground))] bg-[hsl(var(--surface-2))] px-1.5 py-0.5 rounded">
            {enabledCount}/{layers.length}
          </span>
        </div>
        {collapsed ? <ChevronDown size={14} className="text-[hsl(var(--muted-foreground))]" /> : <ChevronUp size={14} className="text-[hsl(var(--muted-foreground))]" />}
      </button>

      {!collapsed && (
        <div className="flex-1 overflow-y-auto p-3">
          {layers.length === 0 ? (
            <div className="text-[10px] text-[hsl(var(--muted-foreground))] text-center py-4 font-mono">
              No processing stages applied yet
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {layers.map((layer) => {
                const Icon = LAYER_ICONS[layer.type] || Layers;
                const color = LAYER_COLORS[layer.type] || 'hsl(var(--muted-foreground))';
                const isEnabled = layer.enabled;

                return (
                  <div
                    key={layer.id}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all border ${
                      isEnabled
                        ? 'bg-[hsl(var(--surface-1))] border-[hsl(var(--border))]'
                        : 'opacity-40 border-transparent'
                    }`}
                  >
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <Icon className="text-[hsl(var(--muted-foreground))] shrink-0" size={13} />
                    <span className="flex-1 text-[11px] font-semibold text-[hsl(var(--foreground))] truncate">
                      {layer.name}
                    </span>
                    <span className="text-[9px] font-mono text-[hsl(var(--muted-foreground))] uppercase shrink-0">
                      {layer.type}
                    </span>
                    <button
                      onClick={() => toggleLayerEnabled(layer.id)}
                      className={`w-9 h-[18px] rounded-full p-0.5 transition-all cursor-pointer shrink-0 ${
                        isEnabled ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--surface-3))]'
                      }`}
                      title={isEnabled ? 'Disable' : 'Enable'}
                    >
                      <div
                        className={`w-3.5 h-3.5 rounded-full bg-white transition-all ${
                          isEnabled ? 'translate-x-[14px]' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
