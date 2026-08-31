'use client';

import React, { useRef } from 'react';
import {
  Sparkles,
  Wand2,
  Dice5,
  SlidersHorizontal,
  Upload,
  RefreshCw,
  Image,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import type { WorldGenSettings, WorldGenMood, WorldGenShape, GenerationPreset } from '../types';

interface WorldGenToolBarProps {
  settings: WorldGenSettings;
  onChange: (patch: Partial<WorldGenSettings>) => void;
  onGenerate?: () => void;
  isExecuting?: boolean;
  executionProgress?: number;
  executionStep?: string;
  generationMode?: 'image';
  onGenerationModeChange?: (mode: 'image') => void;
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
  const [internalMode, setInternalMode] = React.useState<'image'>('image');
  const mode = externalMode ?? internalMode;
  const setMode = (m: 'image') => {
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
    <div className="flex flex-col h-full bg-transparent text-xs select-none overflow-hidden">
      {/* Main Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 no-scrollbar">
        {/* Image to World */}
        <section className="space-y-3">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#F9CF00]">Image to World</h3>
          <div className="space-y-2">
            {/* Reference image upload area */}
            {settings.referenceImage ? (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="relative rounded-2xl border border-[#2f333e] bg-[#1e2026] overflow-hidden shadow-2xl"
              >
                <img
                  src={settings.referenceImage.previewUrl}
                  alt={settings.referenceImage.name}
                  className="w-full h-40 object-cover"
                />
                <button
                  onClick={() => onChange({ referenceImage: null })}
                  className="absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur-md text-[10px] text-red-400 font-bold hover:bg-black/90 transition-all"
                >
                  Remove
                </button>
              </motion.div>
            ) : (
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => referenceImageInputRef.current?.click()}
                className="w-full py-10 rounded-2xl border-2 border-dashed border-[#2f333e] bg-[#1e2026] text-zinc-400 hover:border-[#F9CF00] hover:text-[#F9CF00] transition-all flex flex-col items-center justify-center gap-3 shadow-xl"
              >
                <Upload className="w-6 h-6 stroke-[2.2]" />
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[11px] font-bold text-white">Upload Reference Image</span>
                  <span className="text-[9px] text-zinc-400">JPG, PNG, WebP (Max 20MB)</span>
                </div>
              </motion.button>
            )}
            <textarea
              value={settings.prompt}
              onChange={(e) => onChange({ prompt: e.target.value })}
              placeholder="Describe the desired world based on the reference image..."
              rows={3}
              className="w-full rounded-xl border border-[#2f333e] bg-[#1e2026] px-3 py-2.5 text-xs text-white placeholder:text-zinc-500 resize-none focus:outline-none focus:border-[#F9CF00] transition-colors shadow-inner"
            />
          </div>
        </section>

        {/* Mood & Shape Grid */}
        <div className="grid grid-cols-2 gap-4">
          <section className="space-y-3">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#F9CF00]">Mood</h3>
            <div className="grid grid-cols-1 gap-1.5">
              {MOODS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => onChange({ mood: m.id })}
                  className={`px-2.5 py-2 rounded-lg text-[10px] font-bold text-left transition-all ${
                    settings.mood === m.id
                      ? 'bg-[#F9CF00] text-black shadow-md'
                      : 'text-zinc-300 bg-[#1e2026] border border-[#2f333e] hover:text-white hover:border-[#3d4252]'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#F9CF00]">Shape</h3>
            <div className="grid grid-cols-1 gap-1.5">
              {SHAPES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onChange({ shape: s.id })}
                  className={`px-2.5 py-2 rounded-lg text-[10px] font-bold text-left transition-all ${
                    settings.shape === s.id
                      ? 'bg-[#F9CF00] text-black shadow-md'
                      : 'text-zinc-300 bg-[#1e2026] border border-[#2f333e] hover:text-white hover:border-[#3d4252]'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </section>
        </div>

        {/* Quality Settings */}
        <section className="space-y-3">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#F9CF00]">Quality</h3>
          <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-[#1e2026] border border-[#2f333e]">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => onChange({ preset: p.id })}
                className={`py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                  settings.preset === p.id
                    ? 'bg-[#F9CF00] text-black shadow-md'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* Generate button */}
      <div className="p-4 border-t border-[#2f333e] bg-[#1e2026]">
        <button
          onClick={onGenerate}
          disabled={isExecuting}
          className="w-full py-3.5 rounded-2xl bg-[#F9CF00] text-black text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-xl hover:bg-[#ffe033] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isExecuting ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>{executionStep || `Generating World (${executionProgress || 0}%)...`}</span>
            </>
          ) : (
            <>
              <Wand2 className="w-4 h-4 stroke-[2.2]" />
              <span>GENERATE WORLD</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default WorldGenToolBar;