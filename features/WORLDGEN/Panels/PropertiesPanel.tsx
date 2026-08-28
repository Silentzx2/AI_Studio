'use client';

import React, { useState } from 'react';
import {
  Sun,
  CloudSun,
  Mountain,
  Globe,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { WorldGenStyle } from '../types';

interface PropertiesPanelProps {
  style: WorldGenStyle;
  autoOptimize: boolean;
  textureAtlas: boolean;
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

const SECTIONS = [
  {
    id: 'lighting',
    label: 'Lighting',
    Icon: Sun,
    items: [
      { label: 'Daylight', def: true },
      { label: 'Golden Hour', def: false },
      { label: 'Night', def: false },
    ],
  },
  {
    id: 'atmosphere',
    label: 'Atmosphere',
    Icon: CloudSun,
    items: [
      { label: 'Clouds', def: true },
      { label: 'Fog', def: true },
      { label: 'Rain', def: false },
    ],
  },
  {
    id: 'terrain',
    label: 'Terrain',
    Icon: Mountain,
    items: [
      { label: 'Vegetation', def: true },
      { label: 'Water Bodies', def: true },
      { label: 'Rivers', def: false },
    ],
  },
  {
    id: 'universe',
    label: 'Universe',
    Icon: Globe,
    items: [
      { label: 'Skybox', def: true },
      { label: 'Stars', def: true },
      { label: 'Moon', def: false },
    ],
  },
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
            on ? 'bg-[#f5c518]' : 'bg-[#232733]'
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
  style,
  autoOptimize,
  textureAtlas,
  onStyleChange,
  onToggleOptimize,
  onToggleAtlas,
}) => {
  const [open, setOpen] = useState<Record<string, boolean>>({
    lighting: true,
    atmosphere: true,
    terrain: true,
    universe: true,
  });
  const [toggles, setToggles] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    SECTIONS.forEach((s) => s.items.forEach((it) => { init[`${s.id}-${it.label}`] = it.def; }));
    return init;
  });

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
                  style === s.id
                    ? 'bg-[#f5c518] text-[#111216]'
                    : 'text-[var(--ws-text-muted,#8e95a5)] border border-[var(--ws-border,#232733)] hover:text-[var(--ws-text,#f3f4f6)] hover:bg-[var(--ws-hover-bg,#1f232e)]'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </section>

        <div className="section-divider" />

        {/* Generation toggles */}
        <section className="space-y-2">
          <h3 className="panel-section-label">Generation</h3>
          <div className="rounded-xl border border-[var(--ws-border,#232733)] bg-[var(--ws-panel,#101115)] px-3 py-2">
            <ToggleRow label="Auto Optimize" on={autoOptimize} onChange={onToggleOptimize} />
            <ToggleRow label="Texture Atlas" on={textureAtlas} onChange={onToggleAtlas} />
          </div>
        </section>

        <div className="section-divider" />

        {/* World sections */}
        {SECTIONS.map((section) => {
          const isOpen = open[section.id];
          return (
            <section key={section.id} className="space-y-1.5">
              <button
                onClick={() => setOpen((p) => ({ ...p, [section.id]: !isOpen }))}
                className="w-full flex items-center justify-between text-left"
              >
                <span className="flex items-center gap-2 panel-section-label">
                  <section.Icon className="w-3.5 h-3.5 text-[#f5c518]" />
                  {section.label}
                </span>
                {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
              {isOpen && (
                <div className="rounded-xl border border-[var(--ws-border,#232733)] bg-[var(--ws-panel,#101115)] px-3 py-1.5">
                  {section.items.map((item) => (
                    <ToggleRow
                      key={item.label}
                      label={item.label}
                      on={toggles[`${section.id}-${item.label}`]}
                      onChange={() =>
                        setToggles((p) => ({
                          ...p,
                          [`${section.id}-${item.label}`]: !p[`${section.id}-${item.label}`],
                        }))
                      }
                    />
                  ))}
                </div>
              )}
             </section>
           );
         })}
      </div>
    </div>
  );
};

export default PropertiesPanel;
