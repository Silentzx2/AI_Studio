'use client';

import React from 'react';
import {
  Sparkles,
  Wand2,
  Dice5,
  SlidersHorizontal,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import type { WorldGenSettings, WorldGenMood, WorldGenShape, GenerationPreset } from '../types';

interface WorldGenToolBarProps {
  settings: WorldGenSettings;
  onChange: (patch: Partial<WorldGenSettings>) => void;
}

const MOODS: { id: WorldGenMood; label: string }[] = [
  { id: 'fantasy', label: 'Fantasy' },
  { id: 'sci-fi', label: 'Sci-Fi' },
  { id: 'cyberpunk', label: 'Cyberpunk' },
  { id: 'post-apocalyptic', label: 'Post-Apoc' },
  { id: 'medieval', label: 'Medieval' },
  { id: 'tropical', label: 'Tropical' },
];

const SHAPES: { id: WorldGenShape; label: string }[] = [
  { id: 'flat', label: 'Flat' },
  { id: 'hills', label: 'Hills' },
  { id: 'mountains', label: 'Mountains' },
  { id: 'archipelago', label: 'Archipelago' },
  { id: 'canyon', label: 'Canyon' },
];

const PRESETS: { id: GenerationPreset; label: string }[] = [
  { id: 'balanced', label: 'Balanced' },
  { id: 'speed', label: 'Speed' },
  { id: 'quality', label: 'Quality' },
];

const RESOLUTIONS: { id: '1K' | '2K' | '4K'; label: string }[] = [
  { id: '1K', label: '1K' },
  { id: '2K', label: '2K' },
  { id: '4K', label: '4K' },
];

export const WorldGenToolBar: React.FC<WorldGenToolBarProps> = ({ settings, onChange }) => {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-5">
        {/* Prompt input */}
        <section className="space-y-2">
          <h3 className="panel-section-label flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#f5c518]" />
            Prompt
          </h3>
          <textarea
            value={settings.prompt}
            onChange={(e) => onChange({ prompt: e.target.value })}
            placeholder="Describe the world you want to generate..."
            rows={3}
            className="w-full rounded-lg border border-[var(--ws-border,#232733)] bg-[var(--ws-panel,#101115)] px-3 py-2 text-xs text-[var(--ws-text,#f3f4f6)] placeholder:text-[#4b5563] resize-none focus:outline-none focus:border-[#f5c518]/50 transition-colors"
          />
        </section>

        <div className="section-divider" />

        {/* Mood */}
        <section className="space-y-2">
          <h3 className="panel-section-label">Mood</h3>
          <div className="flex flex-wrap gap-1.5">
            {MOODS.map((m) => (
              <button
                key={m.id}
                onClick={() => onChange({ mood: m.id })}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all ${
                  settings.mood === m.id
                    ? 'bg-[#f5c518] text-[#111216]'
                    : 'text-[var(--ws-text-muted,#8e95a5)] border border-[var(--ws-border,#232733)] hover:text-[var(--ws-text,#f3f4f6)] hover:bg-[var(--ws-hover-bg,#1f232e)]'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </section>

        <div className="section-divider" />

        {/* Shape */}
        <section className="space-y-2">
          <h3 className="panel-section-label">Shape</h3>
          <div className="flex flex-wrap gap-1.5">
            {SHAPES.map((s) => (
              <button
                key={s.id}
                onClick={() => onChange({ shape: s.id })}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all ${
                  settings.shape === s.id
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

        {/* Preset & Resolution */}
        <section className="space-y-3">
          <h3 className="panel-section-label flex items-center gap-1.5">
            <SlidersHorizontal className="w-3.5 h-3.5 text-[#f5c518]" />
            Quality
          </h3>
          <div className="space-y-2">
            <div>
              <span className="text-[10px] text-[var(--ws-text-muted,#8e95a5)] uppercase tracking-wider">Preset</span>
              <div className="flex gap-1.5 mt-1">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => onChange({ preset: p.id })}
                    className={`flex-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${
                      settings.preset === p.id
                        ? 'bg-[#f5c518] text-[#111216]'
                        : 'text-[var(--ws-text-muted,#8e95a5)] border border-[var(--ws-border,#232733)] hover:text-[var(--ws-text,#f3f4f6)] hover:bg-[var(--ws-hover-bg,#1f232e)]'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="text-[10px] text-[var(--ws-text-muted,#8e95a5)] uppercase tracking-wider">Resolution</span>
              <div className="flex gap-1.5 mt-1">
                {RESOLUTIONS.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => onChange({ resolution: r.id })}
                    className={`flex-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${
                      settings.resolution === r.id
                        ? 'bg-[#f5c518] text-[#111216]'
                        : 'text-[var(--ws-text-muted,#8e95a5)] border border-[var(--ws-border,#232733)] hover:text-[var(--ws-text,#f3f4f6)] hover:bg-[var(--ws-hover-bg,#1f232e)]'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <div className="section-divider" />

        {/* Seed */}
        <section className="space-y-2">
          <h3 className="panel-section-label flex items-center gap-1.5">
            <Dice5 className="w-3.5 h-3.5 text-[#f5c518]" />
            Seed
          </h3>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={settings.seed}
              onChange={(e) => onChange({ seed: parseInt(e.target.value, 10) || 0 })}
              className="flex-1 rounded-lg border border-[var(--ws-border,#232733)] bg-[var(--ws-panel,#101115)] px-3 py-1.5 text-xs text-[var(--ws-text,#f3f4f6)] focus:outline-none focus:border-[#f5c518]/50 transition-colors"
            />
            <button
              onClick={() => onChange({ seed: Math.floor(Math.random() * 99999) })}
              className="p-1.5 rounded-lg border border-[var(--ws-border,#232733)] text-[var(--ws-text-muted,#8e95a5)] hover:text-[#f5c518] hover:border-[#f5c518]/50 transition-colors"
              title="Random seed"
            >
              <Dice5 className="w-3.5 h-3.5" />
            </button>
          </div>
        </section>

        <div className="section-divider" />

        {/* Sliders */}
        <section className="space-y-3">
          <h3 className="panel-section-label">Parameters</h3>
          <div className="space-y-2">
            <div>
              <div className="flex justify-between text-[10px] text-[var(--ws-text-muted,#8e95a5)] mb-1">
                <span>Guidance</span>
                <span>{settings.guidance.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min={1}
                max={20}
                step={0.5}
                value={settings.guidance}
                onChange={(e) => onChange({ guidance: parseFloat(e.target.value) })}
                className="w-full accent-[#f5c518]"
              />
            </div>
            <div>
              <div className="flex justify-between text-[10px] text-[var(--ws-text-muted,#8e95a5)] mb-1">
                <span>Size</span>
                <span>{settings.size.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={10}
                step={0.1}
                value={settings.size}
                onChange={(e) => onChange({ size: parseFloat(e.target.value) })}
                className="w-full accent-[#f5c518]"
              />
            </div>
            <div>
              <div className="flex justify-between text-[10px] text-[var(--ws-text-muted,#8e95a5)] mb-1">
                <span>Density</span>
                <span>{settings.density.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings.density}
                onChange={(e) => onChange({ density: parseFloat(e.target.value) })}
                className="w-full accent-[#f5c518]"
              />
            </div>
          </div>
        </section>

        <div className="section-divider" />

        {/* Environment upload */}
        <section className="space-y-2">
          <h3 className="panel-section-label flex items-center gap-1.5">
            <Upload className="w-3.5 h-3.5 text-[#f5c518]" />
            Environment
          </h3>
          {settings.environmentUpload ? (
            <div className="rounded-lg border border-[var(--ws-border,#232733)] bg-[var(--ws-panel,#101115)] p-2 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[var(--ws-text,#f3f4f6)] truncate max-w-[160px]">
                  {settings.environmentUpload.name}
                </span>
                <button
                  onClick={() => onChange({ environmentUpload: null })}
                  className="text-[10px] text-[#ef4444] hover:text-[#f87171] transition-colors"
                >
                  Remove
                </button>
              </div>
              <span className="text-[9px] text-[var(--ws-text-muted,#8e95a5)]">
                {(settings.environmentUpload.sizeBytes / 1024).toFixed(1)} KB
              </span>
            </div>
          ) : (
            <p className="text-[11px] text-[var(--ws-text-muted,#8e95a5)]">
              No environment image uploaded
            </p>
          )}
        </section>
      </div>

      {/* Generate button */}
      <div className="p-4 border-t border-[#1a1d26]">
        <button
          onClick={() => toast.success('World generation started...')}
          className="w-full py-2.5 rounded-lg bg-[#f5c518] text-[#111216] text-xs font-bold flex items-center justify-center gap-2 hover:bg-[#e6b800] transition-colors"
        >
          <Wand2 className="w-4 h-4" />
          Generate World
        </button>
      </div>
    </div>
  );
};

export default WorldGenToolBar;
