"use client";

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare, Image as ImageIcon, SlidersHorizontal,
  Shuffle, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  Sparkles, Ban, Box
} from 'lucide-react';
import { PROMPT_SUGGESTIONS } from '@/constants';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useGenerationStore } from '@/stores/useGenerationStore';
import { useUIStore } from '@/stores/useUIStore';
import { PromptInput } from './PromptInput';
import { ImageUpload } from './ImageUpload';
import { QualitySelector } from './QualitySelector';
import { ToggleOptions } from './ToggleOptions';
import { GenerateButton } from './GenerateButton';
import { ModelSelector } from './ModelSelector';
import { cn } from '@/lib/utils';

function PromptTemplates() {
  const { setPrompt } = useGenerationStore();
  const [showTemplates, setShowTemplates] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setShowTemplates(!showTemplates)}
        className="flex items-center gap-1.5 w-full text-left mb-2 touch-target"
      >
        <Sparkles className="w-3 h-3 text-[hsl(var(--neon-purple)/0.6)]" />
        <p className="panel-section-label">Prompt Templates</p>
        <ChevronDown className="w-3 h-3 text-[hsl(var(--muted-foreground)/0.5)] ml-auto" />
      </button>
      <AnimatePresence>
        {showTemplates && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-1 gap-1.5">
              {PROMPT_SUGGESTIONS.map((s) => (
                <button
                  key={s.text}
                  onClick={() => setPrompt(s.text)}
                  className="text-left px-2.5 py-2 rounded-lg text-[11px] text-muted-foreground hover:text-foreground border border-[hsl(var(--border)/0.15)] hover:border-[hsl(var(--neon-purple)/0.3)] hover:bg-[hsl(var(--neon-purple)/0.05)] transition-all duration-200"
                >
                  <span className="mr-1.5">{s.icon}</span>
                  <span className="line-clamp-2">{s.text}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SectionLabel({ label, icon: Icon }: { label: string; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      {Icon && <Icon className="w-3 h-3 text-[hsl(var(--muted-foreground)/0.4)]" />}
      <p className="panel-section-label">{label}</p>
    </div>
  );
}

function AdvancedControls() {
  const { steps, cfgScale, seed, setSteps, setCfgScale, setSeed } = useGenerationStore();
  const [expanded, setExpanded] = useState(false);

  // Persist advanced settings to localStorage
  useEffect(() => {
    const saved = localStorage.getItem('gen_advanced_settings');
    if (saved) {
      try {
        const cfg = JSON.parse(saved);
        if (cfg.steps) setSteps(cfg.steps);
        if (cfg.cfgScale) setCfgScale(cfg.cfgScale);
        if (cfg.seed !== undefined) setSeed(cfg.seed);
      } catch {}
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('gen_advanced_settings', JSON.stringify({ steps, cfgScale, seed }));
  }, [steps, cfgScale, seed]);

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
          <SlidersHorizontal className="w-3 h-3 text-[hsl(var(--muted-foreground)/0.4)]" />
          <p className="panel-section-label">Advanced</p>
        </div>
        {expanded ? <ChevronUp className="w-3 h-3 text-[hsl(var(--muted-foreground)/0.5)]" /> : <ChevronDown className="w-3 h-3 text-[hsl(var(--muted-foreground)/0.5)]" />}
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
                <Input value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="Random" className="flex-1 h-8 text-xs input-premium font-mono" />
                <Button variant="ghost" size="sm" onClick={randomSeed} className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground rounded-lg hover:bg-white/5">
                  <Shuffle className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
export function LeftSidebar() {
  const { mode, setMode, selectedModel, setSelectedModel, negativePrompt, setNegativePrompt } = useGenerationStore();
  const { leftSidebarCollapsed, toggleLeftSidebar } = useUIStore();

  if (leftSidebarCollapsed) {
    return (
      <aside className="flex flex-col items-center panel-glass border-r border-[hsl(var(--border)/0.25)] h-full py-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={toggleLeftSidebar}
                className="flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:text-foreground transition-all duration-300 hover:bg-white/5 hover:shadow-[0_0_15px_hsl(var(--neon-purple)/0.15)] group"
              >
                <ChevronRight className="w-4 h-4 transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-[hsl(var(--neon-purple))]" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Expand AI Creator</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <div className="flex-1 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-[hsl(var(--neon-purple)/0.3)]" />
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex flex-col panel-glass border-r border-[hsl(var(--border)/0.25)] h-full">
      {/* Header */}
      <div className="panel-header relative">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-[hsl(var(--neon-purple))]" />
          <span className="text-xs font-semibold tracking-wide">AI Creator</span>
        </div>
        <button
          onClick={toggleLeftSidebar}
          className="text-muted-foreground hover:text-foreground transition-all duration-200 p-0.5 rounded-md hover:bg-white/5"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        {/* Gradient accent line */}
        <div className="absolute bottom-0 left-2 right-2 h-px divider-gradient" />
      </div>

      {/* Scrollable content */}
      <ScrollArea className="flex-1 scrollbar-neon">
        <div className="p-3 space-y-4">
          {/* Primary workspace mode */}
          <div className="flex gap-1.5 p-1 rounded-xl bg-[hsl(var(--surface-2)/0.25)] border border-[hsl(var(--border)/0.15)]">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-200 flex-1 justify-center chip-active shadow-[0_0_12px_hsl(var(--neon-purple)/0.12)]">
              <Box className="w-3 h-3" />
              3D
            </div>
          </div>

          {/* Section Divider */}
          <div className="section-divider" />

          <>
              {/* Mode Tabs */}
              <div className="flex gap-1.5 p-1 rounded-xl bg-[hsl(var(--surface-2)/0.25)] border border-[hsl(var(--border)/0.15)]">
                {[
                  { id: 'text-to-3d' as const, icon: MessageSquare, label: 'Text to 3D' },
                  { id: 'image-to-3d' as const, icon: ImageIcon, label: 'Image to 3D' },
                ].map((tab) => {
                  const Icon = tab.icon;
                  const isActive = mode === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setMode(tab.id)}
                      className={cn(
                        'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-200 flex-1 justify-center',
                        isActive
                          ? 'chip-active shadow-[0_0_12px_hsl(var(--neon-purple)/0.12)]'
                          : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.03]'
                      )}
                    >
                      <Icon className="w-3 h-3" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Section Divider */}
              <div className="section-divider" />

              {/* Prompt Templates */}
              <PromptTemplates />
              <div className="section-divider" />

              {/* Prompt */}
              <div>
                <SectionLabel label="Prompt" icon={MessageSquare} />
                {mode === 'text-to-3d' ? <PromptInput /> : <ImageUpload />}
              </div>

              {/* Negative Prompt */}
              {mode === 'text-to-3d' && (
                <div>
                  <SectionLabel label="Negative Prompt" icon={Ban} />
                  <textarea
                    value={negativePrompt}
                    onChange={(e) => setNegativePrompt(e.target.value)}
                    placeholder="Describe what to avoid..."
                    className="w-full min-h-[60px] resize-none input-premium border-dashed text-xs p-2.5 placeholder:text-muted-foreground/30 outline-none"
                  />
                </div>
              )}

              {/* Section Divider */}
              <div className="section-divider" />

              {/* AI Model */}
              <div>
                <SectionLabel label="AI Model" icon={SlidersHorizontal} />
                <ModelSelector value={selectedModel} onChange={setSelectedModel} />
              </div>

              {/* Section Divider */}
              <div className="section-divider" />

              {/* Quality */}
              <div>
                <SectionLabel label="Quality" />
                <QualitySelector />
              </div>

              {/* Section Divider */}
              <div className="section-divider" />

              {/* Options (Style, Texture, Auto Rig) */}
              <div>
                <SectionLabel label="Options" />
                <ToggleOptions />
              </div>

              {/* Section Divider */}
              <div className="section-divider" />

              {/* Advanced */}
              <AdvancedControls />

              {/* Generate Button */}
              <GenerateButton />
          </>
        </div>
      </ScrollArea>
    </aside>
  );
}