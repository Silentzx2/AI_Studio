'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Sparkles, 
  Orbit, 
  Layers, 
  Scan, 
  Maximize2, 
  Activity, 
  X, 
  Compass,
  Cpu,
  Eye,
  Camera
} from 'lucide-react';
import { BorderBeam } from '@/components/animate-ui/border-beam';
import { AnimatedStatusBadge } from '@/components/animate-ui/animated-status-badge';
import { SlidingNumber } from '@/components/animate-ui/sliding-number';
import { RippleButton } from '@/components/animate-ui/ripple-button';
import { ImageZoom } from '@/components/animate-ui/image-zoom';

export interface GenerationPreviewHUDProps {
  isExecuting: boolean;
  debugBlueprint?: boolean;
  executionStep?: string;
  executionProgress?: number;
  onCancel?: () => void;
  onClose?: () => void;
  referenceImage?: string | null;
  prompt?: string | null;
  onCameraPreset?: (preset: 'perspective' | 'front' | 'side' | 'top') => void;
  activeCameraPreset?: string;
  displayMode?: 'holo' | 'scan' | 'wireframe';
  onDisplayModeChange?: (mode: 'holo' | 'scan' | 'wireframe') => void;
}

export const GenerationPreviewHUD: React.FC<GenerationPreviewHUDProps> = ({
  isExecuting,
  debugBlueprint = false,
  executionStep,
  executionProgress = 0,
  onCancel,
  onClose,
  referenceImage,
  prompt,
  onCameraPreset,
  activeCameraPreset = 'perspective',
  displayMode = 'holo',
  onDisplayModeChange,
}) => {
  // Live elapsed counter
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    setElapsedSeconds(0);
    const interval = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isExecuting, debugBlueprint]);

  const rawProgress = isExecuting ? (executionProgress || 12) : 48;
  const clampedProgress = Math.min(100, Math.max(2, Math.round(rawProgress)));

  // Simulated synthesized point/voxel count counting smoothly up with progress
  const simulatedVoxelCount = useMemo(() => {
    return Math.round(clampedProgress * 425 + 3200);
  }, [clampedProgress]);

  // Stage mapping
  const stageInfo = useMemo(() => {
    if (clampedProgress < 20) {
      return {
        badge: 'LATENT ENCODING',
        detail: 'Conditioning prompt & reference geometry',
        stepIndex: 1,
      };
    } else if (clampedProgress < 48) {
      return {
        badge: 'VOXEL SYNTHESIS',
        detail: 'Reconstructing 360° volumetric density',
        stepIndex: 2,
      };
    } else if (clampedProgress < 75) {
      return {
        badge: 'MARCHING CUBES',
        detail: 'Extracting clean manifold surface mesh',
        stepIndex: 3,
      };
    } else if (clampedProgress < 92) {
      return {
        badge: 'SURFACE TEXTURING',
        detail: 'Projecting high-frequency texture latents',
        stepIndex: 4,
      };
    } else {
      return {
        badge: 'PBR OPTIMIZATION',
        detail: 'Baking normal, AO & PBR material maps',
        stepIndex: 5,
      };
    }
  }, [clampedProgress]);

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainder = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.96 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="absolute bottom-16 sm:bottom-20 left-1/2 -translate-x-1/2 z-30 max-w-xl w-[94%] sm:w-full select-none pointer-events-auto"
    >
      <div className="relative rounded-2xl bg-[#0D0E10]/90 backdrop-blur-2xl border border-zinc-800/80 shadow-[0_20px_60px_rgba(0,0,0,0.85)] p-3.5 sm:p-4.5 overflow-hidden">
        {/* 21st.dev BorderBeam Continuous Traveling Glow */}
        <BorderBeam
          size={200}
          duration={5.5}
          colorFrom="#F9CF00"
          colorTo="#38BDF8"
          borderWidth={1.5}
        />

        {/* Ambient Top Glow */}
        <div className="absolute top-0 left-1/4 right-1/4 h-[1px] bg-gradient-to-r from-transparent via-[#F9CF00]/40 to-transparent pointer-events-none" />

        {/* Header Row: Stage, Status, Live Counters */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <AnimatedStatusBadge
              status="running"
              label={stageInfo.badge}
            />

            {/* Neural Activity Frequency Equalizer */}
            <div className="hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-zinc-900/80 border border-zinc-800">
              {[40, 80, 55, 95, 60, 85].map((h, i) => (
                <motion.span
                  key={i}
                  animate={{
                    height: ['3px', `${h * 0.12}px`, '4px'],
                  }}
                  transition={{
                    repeat: Infinity,
                    duration: 0.8 + (i % 3) * 0.2,
                    ease: 'easeInOut',
                    delay: i * 0.12,
                  }}
                  className="w-[2px] bg-[#F9CF00] rounded-full inline-block"
                />
              ))}
              <span className="text-[9px] font-mono text-zinc-400 ml-1 font-semibold">AI CORE</span>
            </div>
          </div>

          <div className="flex items-center gap-3 text-[11px] font-mono font-semibold flex-shrink-0">
            {/* Live Voxels Count */}
            <div className="hidden xs:flex items-center gap-1 text-zinc-400 bg-zinc-900/60 px-2 py-0.5 rounded-md border border-zinc-800/60">
              <Cpu className="w-3 h-3 text-[#38bdf8]" />
              <SlidingNumber value={simulatedVoxelCount} />
              <span className="text-[9px] text-zinc-500">voxels</span>
            </div>

            {/* Elapsed Timer */}
            <div className="flex items-center gap-1 text-zinc-300 bg-zinc-900/80 px-2 py-0.5 rounded-md border border-zinc-800">
              <span className="w-1.5 h-1.5 rounded-full bg-[#F9CF00] animate-pulse" />
              <span>{formatTime(elapsedSeconds)}</span>
            </div>
          </div>
        </div>

        {/* Primary Progress Row with Spring Number & Multi-Color Bar */}
        <div className="space-y-1.5 mb-3">
          <div className="flex items-baseline justify-between">
            <div className="flex items-baseline gap-1.5 min-w-0">
              <span className="text-xl sm:text-2xl font-black text-white font-mono tracking-tight flex items-baseline">
                <SlidingNumber value={clampedProgress} />
                <span className="text-xs sm:text-sm font-bold text-[#F9CF00] ml-0.5">%</span>
              </span>
              <span className="text-xs text-zinc-300 font-medium truncate max-w-[220px] sm:max-w-xs">
                {executionStep || stageInfo.detail}
              </span>
            </div>
            <span className="text-[10px] text-zinc-500 font-mono tracking-wider uppercase">
              Step {stageInfo.stepIndex} of 5
            </span>
          </div>

          {/* Futuristic Glowing Progress Bar */}
          <div className="h-2 sm:h-2.5 w-full bg-zinc-900/90 rounded-full overflow-hidden p-0.5 border border-zinc-800/80 relative shadow-inner">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-[#F9CF00] via-[#fbbf24] to-[#38bdf8] relative overflow-hidden"
              style={{ width: `${clampedProgress}%` }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            >
              {/* Traveling Shimmer Light Pulse */}
              <motion.div
                animate={{ x: ['-100%', '200%'] }}
                transition={{ repeat: Infinity, duration: 1.8, ease: 'linear' }}
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent w-2/3"
              />
            </motion.div>
          </div>

          {/* Micro Stage Breadcrumbs */}
          <div className="grid grid-cols-5 gap-1 pt-1">
            {['Latent', 'Voxel', 'Mesh', 'Texture', 'PBR'].map((label, idx) => {
              const active = stageInfo.stepIndex === idx + 1;
              const completed = stageInfo.stepIndex > idx + 1;
              return (
                <div key={label} className="flex flex-col items-center gap-1">
                  <div 
                    className={`h-1 w-full rounded-full transition-colors duration-300 ${
                      completed 
                        ? 'bg-[#38bdf8]' 
                        : active 
                          ? 'bg-[#F9CF00] shadow-[0_0_8px_rgba(249,207,0,0.8)]' 
                          : 'bg-zinc-800'
                    }`}
                  />
                  <span className={`text-[9px] font-mono tracking-tight transition-colors ${
                    active ? 'text-[#F9CF00] font-bold' : completed ? 'text-zinc-400' : 'text-zinc-600'
                  }`}>
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom Interactive Toolbar: Source Thumbnail, Camera Angles, Display Mode, Cancel */}
        <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
          {/* Reference Image Thumbnail or Prompt Preview */}
          <div className="flex items-center gap-2 min-w-0">
            {referenceImage ? (
              <div className="flex items-center gap-2">
                <div className="relative w-8 h-8 rounded-lg overflow-hidden border border-zinc-700/80 bg-zinc-900 group flex-shrink-0">
                  <ImageZoom
                    src={referenceImage}
                    alt="Reference Image"
                    className="w-full h-full object-cover"
                  />
                  {/* Holographic Laser Scan Line across thumbnail */}
                  <motion.div
                    animate={{ y: ['-100%', '250%'] }}
                    transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
                    className="absolute inset-x-0 h-[1.5px] bg-[#F9CF00] shadow-[0_0_6px_#F9CF00] pointer-events-none"
                  />
                </div>
                <div className="hidden md:flex flex-col text-[10px]">
                  <span className="text-zinc-300 font-semibold truncate max-w-[100px]">Reference</span>
                  <span className="text-[9px] text-zinc-500 font-mono">Image-to-3D</span>
                </div>
              </div>
            ) : prompt ? (
              <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-lg bg-zinc-900/80 border border-zinc-800 text-[10px] text-zinc-300 max-w-[140px] truncate font-medium">
                <Sparkles className="w-3 h-3 text-[#F9CF00] flex-shrink-0" />
                <span className="truncate">{prompt}</span>
              </div>
            ) : (
              <div className="hidden sm:flex items-center gap-1 text-[10px] text-zinc-500 font-mono">
                <Orbit className="w-3 h-3 text-zinc-400 animate-spin" />
                <span>3D Viewport Live</span>
              </div>
            )}
          </div>

          {/* Camera Quick Align Controls */}
          {onCameraPreset && (
            <div className="flex items-center gap-1 bg-zinc-900/90 p-0.5 rounded-lg border border-zinc-800">
              {(
                [
                  { id: 'perspective', label: 'Orbit', icon: Orbit },
                  { id: 'front', label: 'Front' },
                  { id: 'side', label: 'Side' },
                  { id: 'top', label: 'Top' },
                ] as const
              ).map((cam) => {
                const isActive = activeCameraPreset === cam.id;
                const IconComponent = 'icon' in cam ? cam.icon : null;
                return (
                  <button
                    key={cam.id}
                    onClick={() => onCameraPreset(cam.id as any)}
                    title={`Align Camera to ${cam.label}`}
                    className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-all flex items-center gap-1 ${
                      isActive
                        ? 'bg-[#F9CF00] text-black shadow-md font-bold'
                        : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                    }`}
                  >
                    {IconComponent && <IconComponent className="w-2.5 h-2.5" />}
                    <span>{cam.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Display Mode Toggles (Holo / Scan / Wireframe) */}
          {onDisplayModeChange && (
            <div className="hidden lg:flex items-center gap-1 bg-zinc-900/90 p-0.5 rounded-lg border border-zinc-800">
              {(
                [
                  { id: 'holo', label: 'Matrix', icon: Layers },
                  { id: 'scan', label: 'Laser', icon: Scan },
                  { id: 'wireframe', label: 'Wire', icon: Maximize2 },
                ] as const
              ).map((mode) => {
                const isActive = displayMode === mode.id;
                const Icon = mode.icon;
                return (
                  <button
                    key={mode.id}
                    onClick={() => onDisplayModeChange(mode.id)}
                    title={`${mode.label} Mode`}
                    className={`px-1.5 py-1 rounded-md text-[10px] font-semibold transition-all flex items-center gap-1 ${
                      isActive
                        ? 'bg-zinc-700 text-white font-bold'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    <Icon className="w-2.5 h-2.5" />
                    <span>{mode.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Abort / Close Button */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {isExecuting && onCancel ? (
              <RippleButton
                variant="destructive"
                size="sm"
                onClick={onCancel}
                className="px-2.5 py-1 text-[10px] font-semibold flex items-center gap-1"
              >
                <X className="w-3 h-3" />
                <span>Cancel</span>
              </RippleButton>
            ) : onClose ? (
              <RippleButton
                variant="outline"
                size="sm"
                onClick={onClose}
                className="px-2.5 py-1 text-[10px] font-semibold"
              >
                Close Preview
              </RippleButton>
            ) : null}
          </div>
        </div>
      </div>
    </motion.div>
  );
};
