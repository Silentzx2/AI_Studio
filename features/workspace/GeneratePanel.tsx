"use client";


import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare, Image as ImageIcon, SlidersHorizontal,
  Shuffle, ChevronDown, ChevronUp, FolderOpen
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useGenerationStore } from '@/stores/useGenerationStore';
import { PromptInput } from './PromptInput';
import { ImageUpload } from './ImageUpload';
import { QualitySelector } from './QualitySelector';
import { ToggleOptions } from './ToggleOptions';
import { GenerateButton } from './GenerateButton';
import { ModelSelector } from './ModelSelector';
import { cn } from '@/lib/utils';

function SectionHeader({ label, icon: Icon }: { label: string; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex items-center gap-1.5 mb-2.5">
      {Icon && <Icon className="w-3 h-3 text-muted-foreground" />}
      <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest">{label}</p>
    </div>
  );
}

function AdvancedControls() {
  const { steps, cfgScale, seed, setSteps, setCfgScale, setSeed } = useGenerationStore();
  const [expanded, setExpanded] = useState(false);

  const randomSeed = useCallback(() => {
    setSeed(String(Math.floor(Math.random() * 2_147_483_647)));
  }, [setSeed]);

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center justify-between w-full text-left mb-2 touch-target"
      >
        <div className="flex items-center gap-1.5">
          <SlidersHorizontal className="w-3 h-3 text-muted-foreground" />
          <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest">Advanced</p>
        </div>
        {expanded ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden space-y-4"
          >
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-muted-foreground">Steps</span>
                <span className="text-xs font-mono text-foreground">{steps}</span>
              </div>
              <Slider value={[steps]} min={10} max={100} step={5} onValueChange={(v) => setSteps(v[0])} className="cursor-pointer" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-muted-foreground">CFG Scale</span>
                <span className="text-xs font-mono text-foreground">{cfgScale.toFixed(1)}</span>
              </div>
              <Slider value={[cfgScale]} min={1} max={20} step={0.5} onValueChange={(v) => setCfgScale(v[0])} className="cursor-pointer" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-muted-foreground">Seed</span>
              </div>
              <div className="flex items-center gap-2">
                <Input value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="Random" className="flex-1 h-8 text-xs bg-surface-2 border-border font-mono" />
                <Button variant="ghost" size="sm" onClick={randomSeed} className="h-8 px-2 text-muted-foreground hover:text-foreground">
                  <Shuffle className="w-3 h-3" />
                </Button>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-muted-foreground">Output Folder</span>
              </div>
              <Button variant="ghost" size="sm" className="w-full h-8 text-xs bg-surface-2 border border-border justify-start">
                <FolderOpen className="w-3 h-3 mr-2" />
                Default
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ModeTab({ mode, icon: Icon, label }: { mode: 'text-to-3d' | 'image-to-3d'; icon: React.ComponentType<{ className?: string }>; label: string }) {
  const { mode: currentMode, setMode } = useGenerationStore();
  const isActive = currentMode === mode;
  return (
    <button
      onClick={() => setMode(mode)}
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all touch-target',
        isActive
          ? 'bg-[hsl(var(--neon-purple)/0.15)] text-foreground border border-[hsl(var(--neon-purple)/0.25)]'
          : 'text-muted-foreground hover:text-foreground hover:bg-white/5 border border-transparent'
      )}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}

interface GeneratePanelProps {
  isOpen?: boolean;
  onToggle?: () => void;
}

export function GeneratePanel({ isOpen = true, onToggle }: GeneratePanelProps) {
  const { mode, selectedModel, setSelectedModel } = useGenerationStore();

  return (
    <div className="flex flex-col h-full">
      {/* Header with mode tabs and collapse button */}
      <div className="flex items-center gap-1 px-2 sm:px-4 py-2 border-b border-[hsl(var(--border)/0.5)] glass">
        <ModeTab mode="text-to-3d" icon={MessageSquare} label="Text to 3D" />
        <ModeTab mode="image-to-3d" icon={ImageIcon} label="Image to 3D" />
        <div className="flex-1" />
        {onToggle && (
          <button
            onClick={onToggle}
            className="flex items-center justify-center w-6 h-6 rounded text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
            aria-label={isOpen ? 'Collapse' : 'Expand'}
          >
            {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Collapsible/scrollable controls */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex-1 overflow-hidden"
          >
            <ScrollArea className="h-full scrollbar-thin">
              <div className="p-4 space-y-5 max-w-2xl mx-auto">
                <div>
                  <SectionHeader label="Prompt" icon={MessageSquare} />
                  {mode === 'text-to-3d' ? <PromptInput /> : <ImageUpload />}
                </div>
                <div>
                  <SectionHeader label="AI Model" icon={SlidersHorizontal} />
                  <ModelSelector value={selectedModel} onChange={setSelectedModel} />
                </div>
                <div>
                  <SectionHeader label="Quality" />
                  <QualitySelector />
                </div>
                <div>
                  <SectionHeader label="Options" />
                  <ToggleOptions />
                </div>
                <AdvancedControls />
                <GenerateButton />
              </div>
            </ScrollArea>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}