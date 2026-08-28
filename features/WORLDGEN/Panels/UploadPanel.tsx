'use client';

import React, { useRef, useState } from 'react';
import {
  UploadCloud,
  Image as ImageIcon,
  X,
  RefreshCw,
  Dices,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type {
  WorldGenSettings,
  WorldGenMood,
  WorldGenShape,
  GenerationPreset,
  EnvironmentUpload,
} from '../types';

interface UploadPanelProps {
  settings: WorldGenSettings;
  onChange: (patch: Partial<WorldGenSettings>) => void;
}

const MOODS: { id: WorldGenMood; label: string }[] = [
  { id: 'fantasy', label: 'Fantasy' },
  { id: 'sci-fi', label: 'Sci-Fi' },
  { id: 'cyberpunk', label: 'Cyberpunk' },
  { id: 'post-apocalyptic', label: 'Post-Apo' },
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

const PRESETS: { id: GenerationPreset; label: string; note: string }[] = [
  { id: 'balanced', label: 'Balanced', note: 'Best quality / time' },
  { id: 'speed', label: 'Fast', note: 'Quick draft' },
  { id: 'quality', label: 'Ultra Quality', note: 'Best detail' },
];

export const UploadPanel: React.FC<UploadPanelProps> = ({ settings, onChange }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const handleFile = (file: File | undefined | null) => {
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    const upload: EnvironmentUpload = {
      name: file.name,
      previewUrl,
      sizeBytes: file.size,
    };
    onChange({ environmentUpload: upload });
  };

  const clearUpload = () => {
    if (settings.environmentUpload?.previewUrl) {
      URL.revokeObjectURL(settings.environmentUpload.previewUrl);
    }
    onChange({ environmentUpload: null });
  };

  const randomizeSeed = () =>
    onChange({ seed: Math.floor(Math.random() * 999999) + 1 });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-5">
        {/* Environment Image Upload */}
        <section className="space-y-2">
          <h3 className="panel-section-label">Environment Image</h3>
          {!settings.environmentUpload ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragOver(false); handleFile(e.dataTransfer.files?.[0]); }}
              onClick={() => fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-4 py-8 text-center cursor-pointer transition-all ${
                isDragOver
                  ? 'border-[#f5c518] bg-[#f5c518]/5'
                  : 'border-[var(--ws-border,#232733)] bg-[var(--ws-panel,#101115)] hover:border-[#f5c518]/50'
              }`}
            >
              <div className="w-12 h-12 rounded-full bg-[var(--ws-hud-bg,#12141a)] border border-[var(--ws-hud-border,#232733)] flex items-center justify-center text-[#f5c518]">
                <UploadCloud className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-[var(--ws-text,#f3f4f6)]">
                  Drop environment image
                </p>
                <p className="text-[10px] text-[var(--ws-text-muted,#8e95a5)] mt-0.5">
                  or click to browse
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </div>
          ) : (
            <div className="relative rounded-xl overflow-hidden border border-[var(--ws-border,#232733)]">
              <img
                src={settings.environmentUpload.previewUrl}
                alt="Environment reference"
                className="w-full h-36 object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 py-2 flex items-center justify-between">
                <span className="text-[10px] font-semibold text-white truncate pr-2">
                  {settings.environmentUpload.name}
                </span>
                <button
                  onClick={clearUpload}
                  title="Remove image"
                  className="p-1 rounded-md bg-black/40 text-white hover:bg-black/60 transition-colors flex-shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Mood */}
        <section className="space-y-2">
          <h3 className="panel-section-label">Mood / Theme</h3>
          <div className="flex flex-wrap gap-1.5">
            {MOODS.map((m) => (
              <button
                key={m.id}
                onClick={() => onChange({ mood: m.id })}
                className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all ${
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

        {/* Shape */}
        <section className="space-y-2">
          <h3 className="panel-section-label">Terrain Shape</h3>
          <div className="flex flex-wrap gap-1.5">
            {SHAPES.map((s) => (
              <button
                key={s.id}
                onClick={() => onChange({ shape: s.id })}
                className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all ${
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

        {/* Preset */}
        <section className="space-y-2">
          <h3 className="panel-section-label">Preset</h3>
          <div className="grid gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => onChange({ preset: p.id })}
                className={`flex items-center justify-between rounded-lg border px-3 py-2 transition-all ${
                  settings.preset === p.id
                    ? 'border-[#f5c518]/60 bg-[#f5c518]/5'
                    : 'border-[var(--ws-border,#232733)] bg-[var(--ws-panel,#101115)] hover:border-[var(--ws-hud-border,#232733)]'
                }`}
              >
                <div className="text-left">
                  <span className="block text-[11px] font-bold text-[var(--ws-text,#f3f4f6)]">
                    {p.label}
                  </span>
                  <span className="block text-[10px] text-[var(--ws-text-muted,#8e95a5)] mt-0.5">
                    {p.note}
                  </span>
                </div>
                <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${
                  settings.preset === p.id ? 'border-[#f5c518]' : 'border-[var(--ws-text-muted,#8e95a5)]'
                }`}>
                  {settings.preset === p.id && <div className="w-1.5 h-1.5 rounded-full bg-[#f5c518]" />}
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Resolution */}
        <section className="space-y-2">
          <h3 className="panel-section-label">Resolution</h3>
          <div className="flex gap-1.5">
            {(['1K', '2K', '4K'] as const).map((r) => (
              <button
                key={r}
                onClick={() => onChange({ resolution: r })}
                className={`flex-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                  settings.resolution === r
                    ? 'bg-[#f5c518] text-[#111216]'
                    : 'text-[var(--ws-text-muted,#8e95a5)] border border-[var(--ws-border,#232733)] hover:text-[var(--ws-text,#f3f4f6)] hover:bg-[var(--ws-hover-bg,#1f232e)]'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </section>

        {/* Advanced (collapsible) */}
        <section className="space-y-3">
          <button
            onClick={() => setAdvancedOpen(!advancedOpen)}
            className="w-full flex items-center justify-between panel-section-label"
          >
            <span>Advanced</span>
            {advancedOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {advancedOpen && (
            <div className="space-y-4">
              {/* Seed */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-label">Seed</label>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={randomizeSeed}
                      title="Randomize seed"
                      className="p-1 rounded-md text-[var(--ws-text-muted,#8e95a5)] hover:text-[var(--ws-text,#f3f4f6)] hover:bg-[var(--ws-hover-bg,#1f232e)] transition-all"
                    >
                      <Dices className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onChange({ seed: 17 })}
                      title="Reset seed"
                      className="p-1 rounded-md text-[var(--ws-text-muted,#8e95a5)] hover:text-[var(--ws-text,#f3f4f6)] hover:bg-[var(--ws-hover-bg,#1f232e)] transition-all"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <input
                  type="number"
                  value={settings.seed}
                  onChange={(e) => onChange({ seed: parseInt(e.target.value || '0', 10) })}
                  className="input-field-sm font-mono"
                />
              </div>

              {/* Guidance scale */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-label">Guidance</label>
                  <span className="text-value font-mono">{settings.guidance.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={20}
                  step={0.1}
                  value={settings.guidance}
                  onChange={(e) => onChange({ guidance: parseFloat(e.target.value) })}
                  className="slider-field"
                />
              </div>

              {/* World size */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-label">World Size</label>
                  <span className="text-value font-mono">{settings.size.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={8}
                  step={0.1}
                  value={settings.size}
                  onChange={(e) => onChange({ size: parseFloat(e.target.value) })}
                  className="slider-field"
                />
              </div>

              {/* Density */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-label">Density</label>
                  <span className="text-value font-mono">{settings.density.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={settings.density}
                  onChange={(e) => onChange({ density: parseFloat(e.target.value) })}
                  className="slider-field"
                />
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default UploadPanel;
