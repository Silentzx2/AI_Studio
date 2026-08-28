'use client';

import React, { useRef, useState } from 'react';
import {
  UploadCloud,
  X,
  RefreshCw,
  Dices,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
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
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-[#272b36] hover:scrollbar-thumb-[#3b4155] p-3 space-y-3">
        {/* Image to World */}
        <section className="space-y-2">
          <h3 className="text-[10px] font-bold tracking-wider text-[#9ca3af] uppercase">Image to World</h3>
          {!settings.environmentUpload ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragOver(false); handleFile(e.dataTransfer.files?.[0]); }}
              onClick={() => fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-4 text-center cursor-pointer transition-all ${
                isDragOver
                  ? 'border-[#f5c518] bg-[#f5c518]/5'
                  : 'border-[#232733] bg-[#0f1015] hover:border-[#f5c518]/50'
              }`}
            >
              <div className="w-8 h-8 rounded-full bg-[#16181f] border border-[#232733] flex items-center justify-center text-[#f5c518]">
                <UploadCloud className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-[#f3f4f6]">
                  Drop environment image
                </p>
                <p className="text-[9px] text-[#6b7280] mt-0.5">
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
            <div className="relative rounded-lg overflow-hidden border border-[#232733]">
              <img
                src={settings.environmentUpload.previewUrl}
                alt="Environment reference"
                className="w-full h-24 object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-2 py-1.5 flex items-center justify-between">
                <span className="text-[9px] font-semibold text-white truncate pr-2">
                  {settings.environmentUpload.name}
                </span>
                <button
                  onClick={clearUpload}
                  title="Remove image"
                  className="p-1 rounded-md bg-black/50 text-white/80 hover:bg-black/70 hover:text-white transition-colors flex-shrink-0"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Mood */}
        <section className="space-y-1.5">
          <h3 className="text-[10px] font-bold tracking-wider text-[#9ca3af] uppercase">Mood / Theme</h3>
          <div className="flex flex-wrap gap-1">
            {MOODS.map((m) => (
              <button
                key={m.id}
                onClick={() => onChange({ mood: m.id })}
                className={`px-2 py-0.5 rounded-full text-[9px] font-semibold transition-all ${
                  settings.mood === m.id
                    ? 'bg-[#f5c518] text-[#111216]'
                    : 'text-[#6b7280] border border-[#232733] hover:text-[#f3f4f6] hover:bg-[#1a1d26]'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </section>

        {/* Shape */}
        <section className="space-y-1.5">
          <h3 className="text-[10px] font-bold tracking-wider text-[#9ca3af] uppercase">Terrain Shape</h3>
          <div className="flex flex-wrap gap-1">
            {SHAPES.map((s) => (
              <button
                key={s.id}
                onClick={() => onChange({ shape: s.id })}
                className={`px-2 py-0.5 rounded-full text-[9px] font-semibold transition-all ${
                  settings.shape === s.id
                    ? 'bg-[#f5c518] text-[#111216]'
                    : 'text-[#6b7280] border border-[#232733] hover:text-[#f3f4f6] hover:bg-[#1a1d26]'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </section>

        {/* Preset */}
        <section className="space-y-1.5">
          <h3 className="text-[10px] font-bold tracking-wider text-[#9ca3af] uppercase">Preset</h3>
          <div className="grid gap-1">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => onChange({ preset: p.id })}
                className={`flex items-center justify-between rounded-lg border px-2 py-1.5 transition-all ${
                  settings.preset === p.id
                    ? 'border-[#f5c518]/60 bg-[#f5c518]/5'
                    : 'border-[#232733] bg-[#0f1015] hover:border-[#272b36]'
                }`}
              >
                <div className="text-left">
                  <span className="block text-[9px] font-bold text-[#f3f4f6]">
                    {p.label}
                  </span>
                  <span className="block text-[8px] text-[#6b7280] mt-0.5">
                    {p.note}
                  </span>
                </div>
                <div className={`w-2.5 h-2.5 rounded-full border-2 flex items-center justify-center ${
                  settings.preset === p.id ? 'border-[#f5c518]' : 'border-[#6b7280]'
                }`}>
                  {settings.preset === p.id && <div className="w-1 h-1 rounded-full bg-[#f5c518]" />}
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Resolution */}
        <section className="space-y-1.5">
          <h3 className="text-[10px] font-bold tracking-wider text-[#9ca3af] uppercase">Resolution</h3>
          <div className="flex gap-1">
            {(['1K', '2K', '4K'] as const).map((r) => (
              <button
                key={r}
                onClick={() => onChange({ resolution: r })}
                className={`flex-1 px-2 py-1 rounded-lg text-[9px] font-semibold transition-all ${
                  settings.resolution === r
                    ? 'bg-[#f5c518] text-[#111216]'
                    : 'text-[#6b7280] border border-[#232733] hover:text-[#f3f4f6] hover:bg-[#1a1d26]'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </section>

        {/* Advanced (collapsible) */}
        <section className="space-y-2">
          <button
            onClick={() => setAdvancedOpen(!advancedOpen)}
            className="w-full flex items-center justify-between text-[10px] font-bold tracking-wider text-[#9ca3af] uppercase"
          >
            <span>Advanced</span>
            {advancedOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {advancedOpen && (
            <div className="space-y-2.5">
              {/* Seed */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[9px] font-medium text-[#9ca3af]">Seed</label>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={randomizeSeed}
                      title="Randomize seed"
                      className="p-0.5 rounded-md text-[#6b7280] hover:text-[#f5c518] hover:bg-[#1a1d26] transition-all"
                    >
                      <Dices className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => onChange({ seed: 17 })}
                      title="Reset seed"
                      className="p-0.5 rounded-md text-[#6b7280] hover:text-[#f5c518] hover:bg-[#1a1d26] transition-all"
                    >
                      <RefreshCw className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <input
                  type="number"
                  value={settings.seed}
                  onChange={(e) => onChange({ seed: parseInt(e.target.value || '0', 10) })}
                  className="w-full h-7 px-2 rounded-lg bg-[#16181f] border border-[#232733] text-[10px] font-mono text-[#f3f4f6] focus:border-[#f5c518] focus:outline-none focus:ring-1 focus:ring-[#f5c518]/30 transition-colors"
                />
              </div>

              {/* Guidance scale */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[9px] font-medium text-[#9ca3af]">Guidance</label>
                  <span className="text-[9px] font-mono text-[#f5c518]">{settings.guidance.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={20}
                  step={0.1}
                  value={settings.guidance}
                  onChange={(e) => onChange({ guidance: parseFloat(e.target.value) })}
                  className="w-full h-1 rounded-full bg-[#232733] appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#f5c518] [&::-webkit-slider-thumb]:cursor-pointer"
                />
              </div>

              {/* World size */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[9px] font-medium text-[#9ca3af]">World Size</label>
                  <span className="text-[9px] font-mono text-[#f5c518]">{settings.size.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={8}
                  step={0.1}
                  value={settings.size}
                  onChange={(e) => onChange({ size: parseFloat(e.target.value) })}
                  className="w-full h-1 rounded-full bg-[#232733] appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#f5c518] [&::-webkit-slider-thumb]:cursor-pointer"
                />
              </div>

              {/* Density */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[9px] font-medium text-[#9ca3af]">Density</label>
                  <span className="text-[9px] font-mono text-[#f5c518]">{settings.density.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={settings.density}
                  onChange={(e) => onChange({ density: parseFloat(e.target.value) })}
                  className="w-full h-1 rounded-full bg-[#232733] appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#f5c518] [&::-webkit-slider-thumb]:cursor-pointer"
                />
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Generate World Button - Fixed at bottom */}
      <div className="p-3 border-t border-[#1a1d26] bg-[#0c0d12]">
        <button
          onClick={() => toast.success('World generation started...')}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#f5c518] text-[#111216] font-bold text-xs shadow-md shadow-[#f5c518]/20 hover:bg-[#e6b800] hover:shadow-lg hover:shadow-[#f5c518]/30 transition-all active:scale-[0.98]"
        >
          <Sparkles className="w-4 h-4" />
          Generate World
        </button>
      </div>
    </div>
  );
};

export default UploadPanel;
