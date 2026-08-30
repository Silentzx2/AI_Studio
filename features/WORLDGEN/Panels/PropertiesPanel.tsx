'use client';

import React from 'react';
import type { WorldGenSettings, WorldGenStyle } from '../types';

interface PropertiesPanelProps {
  settings: WorldGenSettings;
  onStyleChange: (s: WorldGenStyle) => void;
  onToggleOptimize: () => void;
  onToggleAtlas: () => void;
}

const STYLES: { id: WorldGenStyle; label: string }[] = [
  { id: 'realistic', label: 'Realistic' },
  { id: 'stylized', label: 'Stylized' },
  { id: 'low-poly', label: 'Low Poly' },
  { id: 'voxel', label: 'Voxel' },
];

const DISPLAY_ITEMS: { label: string; key: keyof WorldGenSettings }[] = [
  { label: 'Mood', key: 'mood' },
  { label: 'Shape', key: 'shape' },
  { label: 'Preset', key: 'preset' },
  { label: 'Resolution', key: 'resolution' },
  { label: 'Seed', key: 'seed' },
  { label: 'Guidance', key: 'guidance' },
  { label: 'Size', key: 'size' },
  { label: 'Density', key: 'density' },
];

function ToggleRow({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: () => void;
}) {
  return (
    <button
      onClick={onChange}
      role="switch"
      aria-checked={on}
      className="w-full flex items-center justify-between py-1.5 group"
    >
      <span className="text-[11px] text-[var(--ws-text-muted,#8e95a5)] group-hover:text-[var(--ws-text,#f3f4f6)] transition-colors">
        {label}
      </span>
      <span
        className={`w-7 h-3.5 rounded-full relative transition-colors duration-200 ${
          on ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--surface-3))]'
        }`}
      >
        <span
          className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow-sm transition-all duration-200 ${
            on ? 'translate-x-[14px]' : 'translate-x-[2px]'
          }`}
        />
      </span>
    </button>
  );
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  settings,
  onStyleChange,
  onToggleOptimize,
  onToggleAtlas,
}) => {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-5">
        {/* Render Style */}
        <section className="space-y-2">
          <h3 className="panel-section-label">Render Style</h3>
          <div className="flex gap-1.5">
            {STYLES.map((s) => (
              <button
                key={s.id}
                onClick={() => onStyleChange(s.id)}
                className={`flex-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${
                  settings.style === s.id
                    ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                    : 'text-[var(--ws-text-muted,hsl(var(--muted-foreground)))] border border-[var(--ws-border,hsl(var(--border)))] hover:text-[var(--ws-text,hsl(var(--foreground)))] hover:bg-[var(--ws-hover-bg,hsl(var(--surface-2)))]'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </section>

        <div className="section-divider" />

        {/* Generation settings summary */}
        <section className="space-y-2">
          <h3 className="panel-section-label">Generation Settings</h3>
          <div className="rounded-xl border border-[var(--ws-border,#232733)] bg-[var(--ws-panel,#101115)] px-3 py-2 space-y-1.5">
            {DISPLAY_ITEMS.map((item) => (
              <div key={item.key} className="flex items-center justify-between">
                <span className="text-[11px] text-[var(--ws-text-muted,#8e95a5)]">
                  {item.label}
                </span>
                <span className="text-[11px] text-[var(--ws-text,#f3f4f6)] font-medium">
                  {String(settings[item.key])}
                </span>
              </div>
            ))}
          </div>
        </section>

        <div className="section-divider" />

        {/* Generation toggles */}
        <section className="space-y-2">
          <h3 className="panel-section-label">Generation</h3>
          <div className="rounded-xl border border-[var(--ws-border,#232733)] bg-[var(--ws-panel,#101115)] px-3 py-2">
            <ToggleRow label="Auto Optimize" on={settings.autoOptimize} onChange={onToggleOptimize} />
            <ToggleRow label="Texture Atlas" on={settings.textureAtlas} onChange={onToggleAtlas} />
          </div>
        </section>
      </div>
    </div>
  );
};

export default PropertiesPanel;
