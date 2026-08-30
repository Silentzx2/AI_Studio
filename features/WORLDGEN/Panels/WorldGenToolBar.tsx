'use client';

import React, { useRef } from 'react';
import {
  Sparkles,
  Wand2,
  Dice5,
  SlidersHorizontal,
  Upload,
  RefreshCw,
  Type,
  Image,
} from 'lucide-react';
import { toast } from 'sonner';
import type { WorldGenSettings, WorldGenMood, WorldGenShape, GenerationPreset } from '../types';

interface WorldGenToolBarProps {
  settings: WorldGenSettings;
  onChange: (patch: Partial<WorldGenSettings>) => void;
  onGenerate?: () => void;
  isExecuting?: boolean;
  executionProgress?: number;
  executionStep?: string;
  generationMode?: 'text' | 'image';
  onGenerationModeChange?: (mode: 'text' | 'image') => void;
  onImageUpload?: () => void;
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

export const WorldGenToolBar: React.FC<WorldGenToolBarProps> = ({
  settings,
  onChange,
  onGenerate,
  isExecuting = false,
  executionProgress = 0,
  executionStep = '',
  generationMode: externalMode,
  onGenerationModeChange,
  onImageUpload,
}) => {
  const [internalMode, setInternalMode] = React.useState<'text' | 'image'>('text');
  const mode = externalMode ?? internalMode;
  const setMode = (m: 'text' | 'image') => {
    setInternalMode(m);
    onGenerationModeChange?.(m);
  };

  const referenceImageInputRef = useRef<HTMLInputElement>(null);

  const handleReferenceImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const previewUrl = URL.createObjectURL(file);
      onChange({
        referenceImage: { name: file.name, previewUrl, sizeBytes: file.size },
      });
    }
    e.target.value = '';
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <input
        ref={referenceImageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleReferenceImageUpload}
      />
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-5">
        {/* Prompt input */}
        <section className="space-y-2">
          <h3 className="panel-section-label flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[hsl(var(--primary))]" />
            Prompt
          </h3>
          {/* Mode selector tabs */}
          <div className="flex gap-0.5">
            <button
              onClick={() => setMode('text')}
              className={`flex-1 py-1.5 text-[10px] font-semibold rounded-l-lg flex items-center justify-center gap-1 transition-all ${
                mode === 'text'
                  ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                  : 'border border-[var(--ws-border,hsl(var(--border)))] text-[var(--ws-text-muted,hsl(var(--muted-foreground)))] hover:text-[var(--ws-text,hsl(var(--foreground)))] hover:bg-[var(--ws-hover-bg,hsl(var(--surface-2)))]'
              }`}
            >
              <Type className="w-3 h-3" />
              Text to World
            </button>
            <button
              onClick={() => setMode('image')}
              className={`flex-1 py-1.5 text-[10px] font-semibold rounded-r-lg flex items-center justify-center gap-1 transition-all ${
                mode === 'image'
                  ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                  : 'border border-[var(--ws-border,hsl(var(--border)))] text-[var(--ws-text-muted,hsl(var(--muted-foreground)))] hover:text-[var(--ws-text,hsl(var(--foreground)))] hover:bg-[var(--ws-hover-bg,hsl(var(--surface-2)))]'
              }`}
            >
              <Image className="w-3 h-3" />
              Image to World
            </button>
          </div>
          {mode === 'image' ? (
            <div className="space-y-2">
              {/* Reference image upload area */}
              {settings.referenceImage ? (
                <div className="relative rounded-lg border border-[var(--ws-border,#232733)] bg-[var(--ws-panel,#101115)] overflow-hidden">
                  <img
                    src={settings.referenceImage.previewUrl}
                    alt={settings.referenceImage.name}
                    className="w-full h-32 object-cover"
                  />
                  <button
                    onClick={() => onChange({ referenceImage: null })}
                    className="absolute top-1.5 right-1.5 px-2 py-0.5 rounded-md bg-[hsl(var(--surface-0))]/70 text-[10px] text-[hsl(var(--destructive))] hover:text-[hsl(var(--destructive))] transition-colors"
                  >
                    Remove
                  </button>
                  <div className="px-2 py-1 text-[10px] text-[var(--ws-text-muted,#8e95a5)] truncate">
                    {settings.referenceImage.name}
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => referenceImageInputRef.current?.click()}
                  className="w-full py-6 rounded-lg border-2 border-dashed border-[var(--ws-border,hsl(var(--border)))] bg-[var(--ws-panel,hsl(var(--surface-1)))] text-[var(--ws-text-muted,hsl(var(--muted-foreground)))] hover:border-[hsl(var(--primary))]/50 hover:text-[hsl(var(--primary))] transition-colors flex flex-col items-center justify-center gap-2"
                >
                  <Upload className="w-5 h-5" />
                  <span className="text-[11px] font-medium">Upload Reference Image</span>
                  <span className="text-[9px]">JPG, PNG, WebP</span>
                </button>
              )}
              {/* Prompt for image mode - describes desired output */}
              <textarea
                value={settings.prompt}
                onChange={(e) => onChange({ prompt: e.target.value })}
                placeholder="Describe the desired world based on the reference image..."
                rows={2}
                className="w-full rounded-lg border border-[var(--ws-border,hsl(var(--border)))] bg-[var(--ws-panel,hsl(var(--surface-1)))] px-3 py-2 text-xs text-[var(--ws-text,hsl(var(--foreground)))] placeholder:text-[hsl(var(--muted-foreground))] resize-none focus:outline-none focus:border-[hsl(var(--primary))]/50 transition-colors"
              />
            </div>
          ) : (
            <>
              <textarea
                value={settings.prompt}
                onChange={(e) => onChange({ prompt: e.target.value })}
                placeholder="Describe the world you want to generate..."
                rows={3}
                className="w-full rounded-lg border border-[var(--ws-border,hsl(var(--border)))] bg-[var(--ws-panel,hsl(var(--surface-1)))] px-3 py-2 text-xs text-[var(--ws-text,hsl(var(--foreground)))] placeholder:text-[hsl(var(--muted-foreground))] resize-none focus:outline-none focus:border-[hsl(var(--primary))]/50 transition-colors"
              />
              {/* Optional reference image in text mode */}
              {settings.referenceImage ? (
                <div className="flex items-center gap-2 rounded-lg border border-[var(--ws-border,hsl(var(--border)))] bg-[var(--ws-panel,hsl(var(--surface-1)))] p-1.5">
                  <img
                    src={settings.referenceImage.previewUrl}
                    alt={settings.referenceImage.name}
                    className="w-8 h-8 rounded object-cover"
                  />
                  <span className="flex-1 text-[10px] text-[var(--ws-text,hsl(var(--foreground)))] truncate">
                    {settings.referenceImage.name}
                  </span>
                  <button
                    onClick={() => onChange({ referenceImage: null })}
                    className="text-[10px] text-[hsl(var(--destructive))] hover:text-[hsl(var(--destructive))] transition-colors"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => referenceImageInputRef.current?.click()}
                  className="flex items-center gap-1.5 text-[10px] text-[var(--ws-text-muted,hsl(var(--muted-foreground)))] hover:text-[hsl(var(--primary))] transition-colors"
                >
                  <Upload className="w-3 h-3" />
                  Add optional reference image
                </button>
              )}
            </>
          )}
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
                    ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                    : 'text-[var(--ws-text-muted,hsl(var(--muted-foreground)))] border border-[var(--ws-border,hsl(var(--border)))] hover:text-[var(--ws-text,hsl(var(--foreground)))] hover:bg-[var(--ws-hover-bg,hsl(var(--surface-2)))]'
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

        {/* Preset & Resolution */}
        <section className="space-y-3">
          <h3 className="panel-section-label flex items-center gap-1.5">
            <SlidersHorizontal className="w-3.5 h-3.5 text-[hsl(var(--primary))]" />
            Quality
          </h3>
          <div className="space-y-2">
            <div>
              <span className="text-[10px] text-[var(--ws-text-muted,hsl(var(--muted-foreground)))] uppercase tracking-wider">Preset</span>
              <div className="flex gap-1.5 mt-1">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => onChange({ preset: p.id })}
                    className={`flex-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${
                      settings.preset === p.id
                        ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                        : 'text-[var(--ws-text-muted,hsl(var(--muted-foreground)))] border border-[var(--ws-border,hsl(var(--border)))] hover:text-[var(--ws-text,hsl(var(--foreground)))] hover:bg-[var(--ws-hover-bg,hsl(var(--surface-2)))]'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="text-[10px] text-[var(--ws-text-muted,hsl(var(--muted-foreground)))] uppercase tracking-wider">Resolution</span>
              <div className="flex gap-1.5 mt-1">
                {RESOLUTIONS.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => onChange({ resolution: r.id })}
                    className={`flex-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${
                      settings.resolution === r.id
                        ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                        : 'text-[var(--ws-text-muted,hsl(var(--muted-foreground)))] border border-[var(--ws-border,hsl(var(--border)))] hover:text-[var(--ws-text,hsl(var(--foreground)))] hover:bg-[var(--ws-hover-bg,hsl(var(--surface-2)))]'
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
            <Dice5 className="w-3.5 h-3.5 text-[hsl(var(--primary))]" />
            Seed
          </h3>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={settings.seed}
              onChange={(e) => onChange({ seed: parseInt(e.target.value, 10) || 0 })}
              className="flex-1 rounded-lg border border-[var(--ws-border,hsl(var(--border)))] bg-[var(--ws-panel,hsl(var(--surface-1)))] px-3 py-1.5 text-xs text-[var(--ws-text,hsl(var(--foreground)))] focus:outline-none focus:border-[hsl(var(--primary))]/50 transition-colors"
            />
            <button
              onClick={() => onChange({ seed: Math.floor(Math.random() * 99999) })}
              className="p-1.5 rounded-lg border border-[var(--ws-border,hsl(var(--border)))] text-[var(--ws-text-muted,hsl(var(--muted-foreground)))] hover:text-[hsl(var(--primary))] hover:border-[hsl(var(--primary))]/50 transition-colors"
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
                className="w-full accent-[hsl(var(--primary))]"
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
                className="w-full accent-[hsl(var(--primary))]"
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
                className="w-full accent-[hsl(var(--primary))]"
              />
            </div>
          </div>
        </section>

        <div className="section-divider" />

        {/* Environment upload */}
        <section className="space-y-2">
          <h3 className="panel-section-label flex items-center gap-1.5">
            <Upload className="w-3.5 h-3.5 text-[hsl(var(--primary))]" />
            Environment
          </h3>
          {settings.environmentUpload ? (
            <div className="rounded-lg border border-[var(--ws-border,hsl(var(--border)))] bg-[var(--ws-panel,hsl(var(--surface-1)))] p-2 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[var(--ws-text,hsl(var(--foreground)))] truncate max-w-[160px]">
                  {settings.environmentUpload.name}
                </span>
                <button
                  onClick={() => onChange({ environmentUpload: null })}
                  className="text-[10px] text-[hsl(var(--destructive))] hover:text-[hsl(var(--destructive))] transition-colors"
                >
                  Remove
                </button>
              </div>
              <span className="text-[9px] text-[var(--ws-text-muted,hsl(var(--muted-foreground)))]">
                {(settings.environmentUpload.sizeBytes / 1024).toFixed(1)} KB
              </span>
            </div>
          ) : (
            <button
              onClick={onImageUpload}
              className="w-full py-3 rounded-lg border border-dashed border-[var(--ws-border,hsl(var(--border)))] bg-[var(--ws-panel,hsl(var(--surface-1)))] text-[11px] text-[var(--ws-text-muted,hsl(var(--muted-foreground)))] hover:border-[hsl(var(--primary))]/50 hover:text-[hsl(var(--primary))] transition-colors flex items-center justify-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" />
              Upload Environment Image
            </button>
          )}
        </section>
      </div>

      {/* Generate button */}
      <div className="p-4 border-t border-[var(--ws-border,hsl(var(--border)))]">
        <button
          onClick={onGenerate}
          disabled={isExecuting}
          className="w-full py-2.5 rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-xs font-bold flex items-center justify-center gap-2 hover:bg-[hsl(var(--primary))]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isExecuting ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>{executionStep || `Generating World (${executionProgress || 0}%)...`}</span>
            </>
          ) : (
            <>
              <Wand2 className="w-4 h-4" />
              <span>Generate World</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default WorldGenToolBar;
