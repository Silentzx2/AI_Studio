'use client';

import { motion } from 'framer-motion';
import { Clock, Triangle, Cpu } from 'lucide-react';
import { useGenerationStore } from '@/stores/useGenerationStore';
import { QUALITY_PRESETS } from '@/constants';
import { cn } from '@/lib/utils';

const PRESET_ICONS = [Triangle, Cpu, Triangle];

export function QualitySelector() {
  const { quality, setQuality } = useGenerationStore();

  return (
    <div className="grid grid-cols-3 gap-2">
      {QUALITY_PRESETS.map((preset, i) => {
        const Icon = PRESET_ICONS[i];
        const isActive = quality === preset.id;
        return (
          <motion.button
            key={preset.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: i * 0.07 }}
            onClick={() => setQuality(preset.id)}
            className={cn(
              'relative flex flex-col gap-1.5 p-3 rounded-xl border text-left transition-all duration-300 overflow-hidden',
              isActive
                ? 'card-premium shadow-[0_0_20px_hsl(var(--neon-purple)/0.12),inset_0_1px_0_hsl(var(--neon-purple)/0.1)] border-[hsl(var(--neon-purple)/0.3)] text-foreground hover:shadow-[0_0_25px_hsl(var(--neon-purple)/0.15),0_4px_20px_hsl(var(--surface-0)/0.3)] hover:-translate-y-0.5'
                : 'card-premium hover:shadow-[0_4px_20px_hsl(var(--surface-0)/0.3)] text-muted-foreground hover:text-foreground hover:-translate-y-0.5'
            )}
          >
            {/* Gradient overlay when active */}
            {isActive && (
              <motion.div
                layoutId="quality-active"
                className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--neon-purple)/0.06)] to-transparent pointer-events-none"
                transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
              />
            )}
            <div className="relative flex items-center justify-between">
              <Icon className={cn(
                'w-4 h-4 transition-all duration-300',
                isActive ? 'text-[hsl(var(--neon-purple))] drop-shadow-[0_0_8px_hsl(var(--neon-purple)/0.5)]' : 'text-muted-foreground/50'
              )} />
              {isActive && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--neon-purple))] shadow-[0_0_6px_hsl(var(--neon-purple)/0.6)]"
                />
              )}
            </div>
            <div className="relative">
              <p className={cn('text-xs font-semibold leading-tight', isActive && 'text-foreground')}>{preset.label}</p>
              <p className={cn('text-[10px] mt-0.5 leading-tight', isActive ? 'text-muted-foreground/70' : 'text-muted-foreground/40')}>{preset.polygons}</p>
            </div>
            <div className="relative flex items-center gap-1 mt-0.5">
              <Clock className={cn('w-2.5 h-2.5', isActive ? 'text-[hsl(var(--neon-blue)/0.7)]' : 'text-muted-foreground/30')} />
              <span className={cn('text-[10px]', isActive ? 'text-muted-foreground/70' : 'text-muted-foreground/40')}>{preset.time}</span>
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}