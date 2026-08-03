'use client';

import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Stats } from '@react-three/drei';
import { motion, AnimatePresence } from 'framer-motion';
import { Box, Sparkles } from 'lucide-react';
import { ViewerScene } from './ViewerScene';
import { ViewerToolbar } from './ViewerToolbar';
import { useUIStore } from '@/stores/useUIStore';
import { useGenerationStore } from '@/stores/useGenerationStore';
import { cn } from '@/lib/utils';

function ViewerPlaceholder() {
  const { currentJob } = useGenerationStore();

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
      <AnimatePresence mode="wait">
        {!currentJob || currentJob.status === 'idle' ? (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-5 text-center float-subtle">
            <div className="relative">
              {/* Pulse ring animation */}
              <div className="absolute inset-0 rounded-3xl animate-ping" style={{ animationDuration: '3s' }} />
              <div className="absolute -inset-3 rounded-[2rem] border border-[hsl(var(--neon-purple)/0.1)] animate-pulse" style={{ animationDuration: '4s' }} />
              <div className="absolute -inset-6 rounded-[2.5rem] border border-dashed border-[hsl(var(--neon-purple)/0.05)]" style={{ animation: 'spin-slow 30s linear infinite' }} />
              {/* Icon container with glow */}
              <div className="relative w-20 h-20 rounded-2xl bg-[hsl(var(--neon-purple)/0.08)] border border-[hsl(var(--neon-purple)/0.25)] flex items-center justify-center" style={{ boxShadow: '0 0 30px hsl(var(--neon-purple)/0.15), 0 0 60px hsl(var(--neon-purple)/0.05), inset 0 1px 0 hsl(var(--neon-purple)/0.1)' }}>
                <Box className="w-10 h-10 text-[hsl(var(--neon-purple))/70]" style={{ filter: 'drop-shadow(0 0 10px hsl(var(--neon-purple)/0.6))', animation: 'float-subtle 6s ease-in-out infinite' }} />
              </div>
              {/* Sparkles badge */}
              <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-[hsl(var(--neon-purple)/0.15)] border border-[hsl(var(--neon-purple)/0.3)] flex items-center justify-center" style={{ boxShadow: '0 0 12px hsl(var(--neon-purple)/0.3)' }}>
                <Sparkles className="w-3 h-3 text-[hsl(var(--neon-purple))]" style={{ filter: 'drop-shadow(0 0 4px hsl(var(--neon-purple)/0.8))' }} />
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-gradient">What will you create today?</p>
              <p className="text-xs text-muted-foreground/60 mt-1.5" style={{ textShadow: '0 0 20px hsl(var(--neon-purple) / 0.15)' }}>Generate a model to preview it here</p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function ThreeDViewer() {
  const { viewer } = useUIStore();
  const { currentJob } = useGenerationStore();

  return (
    <div className={cn('relative flex flex-col bg-[hsl(var(--surface-0))] overflow-hidden', viewer.fullscreen ? 'fixed inset-0 z-50' : 'flex-1 min-h-0')}>
      <div className="relative flex-1 min-h-0">
        <ViewerToolbar />
        <ViewerPlaceholder />
        {/* Camera viewport corner decorations */}
        <div className="absolute top-2 left-2 w-6 h-6 pointer-events-none z-10" style={{ borderTop: '1.5px solid hsl(var(--neon-purple) / 0.25)', borderLeft: '1.5px solid hsl(var(--neon-purple) / 0.25)', borderRadius: '4px 0 0 0' }} />
        <div className="absolute top-2 right-2 w-6 h-6 pointer-events-none z-10" style={{ borderTop: '1.5px solid hsl(var(--neon-purple) / 0.25)', borderRight: '1.5px solid hsl(var(--neon-purple) / 0.25)', borderRadius: '0 4px 0 0' }} />
        <div className="absolute bottom-2 left-2 w-6 h-6 pointer-events-none z-10" style={{ borderBottom: '1.5px solid hsl(var(--neon-purple) / 0.25)', borderLeft: '1.5px solid hsl(var(--neon-purple) / 0.25)', borderRadius: '0 0 0 4px' }} />
        <div className="absolute bottom-2 right-2 w-6 h-6 pointer-events-none z-10" style={{ borderBottom: '1.5px solid hsl(var(--neon-purple) / 0.25)', borderRight: '1.5px solid hsl(var(--neon-purple) / 0.25)', borderRadius: '0 0 4px 0' }} />
        <Canvas camera={{ position: [0, 2, 5], fov: 50 }} shadows gl={{ antialias: true, alpha: true }} className="w-full h-full" style={{ background: 'transparent' }}>
          <Suspense fallback={null}>
            <ViewerScene />
          </Suspense>
          {viewer.showStats && <Stats className="!absolute !top-14 !left-4" />}
        </Canvas>
        {/* Cinematic animated mesh background */}
        <div className="absolute inset-0 pointer-events-none -z-10 bg-animated-mesh">
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 40%, hsl(260 20% 8%) 0%, hsl(255 18% 5%) 40%, hsl(250 15% 3%) 70%, hsl(248 12% 2%) 100%)' }} />
        </div>
        {/* Vignette / inner shadow effect */}
        <div className="absolute inset-0 pointer-events-none -z-10" style={{ boxShadow: 'inset 0 0 120px 40px hsl(var(--surface-0)/0.7), inset 0 0 60px 20px hsl(250 20% 2%/0.5)' }} />
        {/* Fullscreen ambient glow border */}
        {viewer.fullscreen && (
          <div className="absolute inset-0 pointer-events-none -z-10 rounded-none" style={{ boxShadow: 'inset 0 0 80px 10px hsl(var(--neon-purple)/0.04), inset 0 0 2px 1px hsl(var(--neon-purple)/0.15), inset 0 0 200px 40px hsl(var(--neon-blue)/0.03)' }} />
        )}
      </div>
    </div>
  );
}