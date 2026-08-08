'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Square, Zap, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useGeneration } from '@/hooks/useGeneration';
import { useGenerationStore } from '@/stores/useGenerationStore';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';
import { runtimeService } from '@/services/runtimeService';

export function GenerateButton() {
  const { generate, cancel, isGenerating, currentJob } = useGeneration();
  const { mode, prompt, uploadedImage, quality, generateTexture, autoRig, selectedModel } = useGenerationStore();
  const [colabIncompatible, setColabIncompatible] = useState(false);
  const [colabReason, setColabReason] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    runtimeService.getOptions().then((opts) => {
      if (cancelled || !opts) return;
      const model = opts.three_d_models.find((m) => m.id === selectedModel);
      if (model?.colab_incompatible) {
        setColabIncompatible(true);
        setColabReason(model.colab_skip_reason || 'Model incompatible with current runtime');
      } else {
        setColabIncompatible(false);
        setColabReason(null);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [selectedModel]);

  const isDisabled = !isGenerating && (
    (mode === 'text-to-3d' && !prompt.trim()) ||
    (mode === 'image-to-3d' && !uploadedImage) ||
    colabIncompatible
  );

  const CREDIT_MAP: Record<string, number> = { 'low-poly': 10, 'standard': 20, 'high-poly': 50 };
  const baseCredits = CREDIT_MAP[quality] || 20;
  const textureCredits = generateTexture ? 5 : 0;
  const rigCredits = autoRig ? 10 : 0;
  const totalCredits = baseCredits + textureCredits + rigCredits;

  const progress = currentJob?.progress ?? 0;

  return (
    <div className="space-y-2">
      <AnimatePresence>
        {isGenerating && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] text-muted-foreground tracking-wide">
                {currentJob?.status === 'queued' ? 'In queue...' :
                 currentJob?.status === 'generating' ? 'Generating mesh...' :
                 currentJob?.status === 'texturing' ? 'Applying textures...' :
                 currentJob?.status === 'rigging' ? 'Auto rigging...' : 'Processing...'}
              </span>
            <span className="text-[11px] font-mono text-[hsl(var(--neon-purple))] drop-shadow-[0_0_6px_hsl(var(--neon-purple)/0.4)]">{progress}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-[hsl(var(--surface-2)/0.5)] overflow-hidden border border-[hsl(var(--border)/0.15)]">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-[hsl(var(--neon-purple))] via-[hsl(var(--neon-blue))] to-[hsl(var(--neon-cyan))]"
                initial={{ width: '0%' }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
                style={{ boxShadow: '0 0 12px hsl(var(--neon-purple) / 0.4), 0 0 4px hsl(var(--neon-blue) / 0.3)' }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {colabIncompatible && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-[hsl(var(--neon-amber)/0.1)] border border-[hsl(var(--neon-amber)/0.3)] text-[11px] text-[hsl(var(--neon-amber))]">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            This model requires more VRAM than the current Google Colab runtime is designed to provide.
            Running it may cause GPU OOM, process termination, or runtime crash.
            {colabReason && <span className="block text-[10px] opacity-80 mt-0.5">{colabReason}</span>}
          </span>
        </div>
      )}

      <div className="flex gap-2">
        <div className="relative flex-1 glow-border-animated rounded-xl">
          <Button
            onClick={isGenerating ? cancel : generate}
            disabled={isDisabled}
            className={cn(
              'relative flex-1 w-full h-11 font-semibold text-sm transition-all duration-300 rounded-xl overflow-hidden group',
              isGenerating
                ? 'bg-destructive/10 hover:bg-destructive/20 text-destructive border border-destructive/25 hover:border-destructive/40'
                : colabIncompatible
                  ? 'bg-[hsl(var(--neon-amber)/0.1)] text-[hsl(var(--neon-amber))] border border-[hsl(var(--neon-amber)/0.3)] cursor-not-allowed'
                  : 'bg-gradient-to-r from-[hsl(var(--neon-purple))] via-[hsl(var(--neon-purple)/0.9)] to-[hsl(var(--neon-blue))] hover:shadow-[0_0_30px_hsl(var(--neon-purple)/0.4),0_0_60px_hsl(var(--neon-blue)/0.2),0_0_80px_hsl(var(--neon-purple)/0.1)] hover:scale-[1.02] active:scale-[0.98] text-white border border-[hsl(var(--neon-purple)/0.2)]',
              isDisabled && 'opacity-30 cursor-not-allowed shadow-none hover:shadow-none grayscale-[0.3] border-dashed hover:scale-100'
            )}
            style={!isDisabled && !isGenerating && !colabIncompatible ? {
              boxShadow: '0 0 15px hsl(var(--neon-purple) / 0.25), 0 0 40px hsl(var(--neon-purple) / 0.1)',
            } : undefined}
          >
            {/* Shimmer/shine effect */}
            {!isDisabled && !isGenerating && !colabIncompatible && (
              <span className="absolute inset-0 overflow-hidden rounded-xl">
                <span className="absolute inset-0 -translate-x-full animate-[shine-sweep_3s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/[0.15] to-transparent" />
              </span>
            )}
            {/* Loading shimmer for disabled state */}
            {isDisabled && (
              <span className="absolute inset-0 overflow-hidden rounded-xl">
                <span className="absolute inset-0 -translate-x-full animate-[shimmer_3s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
              </span>
            )}
            {/* Cancel pulse */}
            {isGenerating && (
              <span className="absolute inset-0 rounded-xl animate-[pulse-glow_2s_ease-in-out_infinite]" style={{ boxShadow: '0 0 8px hsl(var(--destructive) / 0.15)' }} />
            )}
            <span className="relative z-10 flex items-center justify-center gap-2">
              {isGenerating ? (
                <><Square className="w-4 h-4" /> Cancel Generation</>
              ) : colabIncompatible ? (
                <><AlertTriangle className="w-4 h-4" /> Model Unavailable on Colab</>
              ) : (
                <><Sparkles className="w-4 h-4 transition-transform duration-300 group-hover:rotate-12 group-hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.6)]" /> Generate 3D Model</>
              )}
            </span>
          </Button>
        </div>
      </div>
      <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
        <Zap className="w-3 h-3 text-[hsl(var(--neon-amber))]" />
        <span>Est. cost: <span className="font-mono text-foreground">{totalCredits}</span> credits</span>
      </div>
    </div>
  );
}