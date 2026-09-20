'use client';

import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Save,
  Share2,
  Download,
  Film,
  Bone,
  GitCompare,
  Sparkles,
  Layers,
  BookOpen,
  Box,
  Sliders,
  FolderOpen,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { MOTION_FAST } from '@/lib/motion';
import { useAnimationStore, AnimationStudioMode } from '@/stores/useAnimationStore';
import { useWorkspace } from '../store/WorkspaceContext';
import { AnimationLeftPanel } from './AnimationLeftPanel';
import { AnimationViewportStage } from './AnimationViewportStage';
import { AnimationRightInspector } from './AnimationRightInspector';
import { toast } from 'sonner';

import { useViewerStore } from '@/stores/useViewerStore';

export const AnimationStudio: React.FC = () => {
  const { navigateToTool, currentAsset, setIsExportModalOpen } = useWorkspace();
  const viewerStore = useViewerStore();
  const [mobilePanel, setMobilePanel] = useState<'none' | 'left' | 'right'>('none');
  const {
    activeMode,
    setActiveMode,
    setRigStatus, setRigProfile, setBones, setBoneRotations, setAnimations, setCurrentAnimationId, setCurrentTime, setDuration, setFps, setTracks, setBlendState, setDisplayOptions, setTransform,
    setInspectorTab,
    rigStatus,
    animations, currentAnimationId, currentTime, duration, fps, tracks, rigProfile, bones, boneRotations, blendState, displayOptions, transform,
  } = useAnimationStore();

  useEffect(() => {
    try {
      const raw = localStorage.getItem('ai-studio-animation-project');
      if (!raw) return;
      const snapshot = JSON.parse(raw);
      if (!snapshot || snapshot.version !== 1) return;
      if (Array.isArray(snapshot.animations)) setAnimations(snapshot.animations);
      if (typeof snapshot.currentAnimationId === 'string') setCurrentAnimationId(snapshot.currentAnimationId);
      if (Number.isFinite(snapshot.currentTime)) setCurrentTime(snapshot.currentTime);
      if (Number.isFinite(snapshot.duration)) setDuration(snapshot.duration);
      if (Number.isFinite(snapshot.fps)) setFps(snapshot.fps);
      if (Array.isArray(snapshot.tracks)) setTracks(snapshot.tracks);
      if (snapshot.blendState) setBlendState(snapshot.blendState);
      if (snapshot.displayOptions) setDisplayOptions(snapshot.displayOptions);
      if (snapshot.transform) setTransform(snapshot.transform);
      if (snapshot.rigProfile) setRigProfile(snapshot.rigProfile);
      if (Array.isArray(snapshot.bones)) setBones(snapshot.bones);
      if (snapshot.boneRotations) setBoneRotations(snapshot.boneRotations);
      setRigStatus(snapshot.currentAssetId && currentAsset?.id === snapshot.currentAssetId ? (snapshot.rigStatus || 'not_rigged') : 'not_rigged');
    } catch (error) {
      console.warn('Animation project restore skipped:', error);
    }
  }, [currentAsset?.id, setAnimations, setCurrentAnimationId, setCurrentTime, setDuration, setFps, setTracks, setBlendState, setDisplayOptions, setTransform, setRigProfile, setBones, setBoneRotations, setRigStatus]);

  const handleModeChange = (mode: AnimationStudioMode) => {
    setActiveMode(mode);
    if (mode === 'rigging') {
      setInspectorTab('rigging');
    } else if (mode === 'motion_ai' || mode === 'blend') {
      setInspectorTab('animation');
    } else {
      setInspectorTab('properties');
    }
  };

  const handleSave = () => {
    try {
      const snapshot = { version: 1, savedAt: new Date().toISOString(), currentAssetId: currentAsset?.id || null, rigStatus, rigProfile, bones, boneRotations, animations, currentAnimationId, currentTime, duration, fps, tracks, blendState, displayOptions, transform };
      localStorage.setItem('ai-studio-animation-project', JSON.stringify(snapshot));
      toast.success('Animation Project Saved', { description: `Saved locally at ${new Date(snapshot.savedAt).toLocaleTimeString()}` });
    } catch (err) {
      toast.error('Save failed', { description: err instanceof Error ? err.message : 'Unable to persist animation project' });
    }
  };

  const handleShare = () => {
    const url = window.location.href;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url);
      toast.success('Workspace URL Copied', {
        description: 'Copies the current workspace URL. Project state is not embedded in the link.',
      });
    } else {
      toast.info('Current workspace URL: ' + url);
    }
  };

  const modelName = currentAsset?.name || viewerStore.loadedModelName || 'character.glb';
  const realPolys = currentAsset?.faces || currentAsset?.triangles || viewerStore.modelStats?.triangles || 0;
  const polysText = realPolys > 0 ? `${realPolys.toLocaleString()} Polys` : 'Ready';

  return (
    <div className="flex flex-col h-full w-full bg-[hsl(var(--surface-0))] text-[#E0E2E8] overflow-hidden select-none">
      {/* SLEEK SINGLE BAR HEADER */}
      <div className="flex-shrink-0 h-12 bg-[hsl(var(--surface-0))] border-b border-white/[0.08] px-4 flex items-center justify-between z-20">
        {/* Left: Back Arrow + Page Title + Mode Tabs */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigateToTool('model')}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
            aria-label="Back to Model Generation"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <h1 className="text-xs font-black tracking-wide text-white uppercase flex items-center gap-1.5">
              <span>Animation Studio</span>
              <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-primary/10 text-primary border border-primary/20">
                PRO
              </span>
            </h1>
          </div>
          <div className="h-4 w-px bg-white/10 mx-1 hidden sm:block" />

          {/* Mode Selector Pills */}
          <div className="flex items-center gap-1 bg-[hsl(var(--surface-0))] p-0.5 rounded-xl border border-white/[0.06]">
            {[
              { id: 'animate', label: 'Animate', icon: <Film className="w-3.5 h-3.5" /> },
              { id: 'rigging', label: 'Rigging', icon: <Bone className="w-3.5 h-3.5" /> },
              { id: 'motion_ai', label: 'Motion AI', icon: <Sparkles className="w-3.5 h-3.5" /> },
            ].map((mode) => {
              const isActive = activeMode === mode.id;
              return (
                <button
                  key={mode.id}
                  onClick={() => handleModeChange(mode.id as AnimationStudioMode)}
                  className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-primary text-black shadow-sm'
                      : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                  }`}
                >
                  {mode.icon}
                  <span className="hidden sm:inline">{mode.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Real Active Model Pill + Save + Share + Export */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Real Model Pill */}
          <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-[hsl(var(--surface-1))] border border-white/[0.08] rounded-xl text-xs">
            <Box className="w-3.5 h-3.5 text-primary" />
            <span className="font-semibold text-zinc-200">{modelName}</span>
            <span className="text-zinc-600">•</span>
            <span className="text-zinc-400">{polysText}</span>
            <span className="text-zinc-600">•</span>
            <span className="text-emerald-400 font-semibold capitalize flex items-center gap-1">
              {rigStatus === 'rigged' ? 'Rigged' : 'Rig Required'}
            </span>
          </div>

          <button
            onClick={handleSave}
            className="p-2 rounded-xl bg-[hsl(var(--surface-2))] hover:bg-[hsl(var(--surface-3))] border border-white/[0.08] text-zinc-300 hover:text-white transition-all cursor-pointer"
            title="Save Project"
          >
            <Save className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleShare}
            className="p-2 rounded-xl bg-[hsl(var(--surface-2))] hover:bg-[hsl(var(--surface-3))] border border-white/[0.08] text-zinc-300 hover:text-white transition-all cursor-pointer"
            title="Copy Workspace URL"
          >
            <Share2 className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setIsExportModalOpen(true)}
            className="flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 rounded-xl bg-primary hover:bg-[hsl(var(--primary)/0.9)] text-black font-bold text-xs transition-all shadow-[0_2px_12px_rgba(249,207,0,0.25)] active:scale-95 cursor-pointer ml-0.5 sm:ml-1"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* MAIN WORKSPACE BODY - Responsive 3-Column on desktop, Viewport-centric with drawer sheets on mobile */}
      <div className="flex-1 flex overflow-hidden relative min-h-0">
        {/* Left Column: Model & Assets + Animation Library (Desktop) */}
        <div className="hidden lg:flex h-full flex-shrink-0">
          <AnimationLeftPanel />
        </div>

        {/* Center Column: 3D Viewport + NLA Timeline */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative">
          <AnimationViewportStage />

          {/* Mobile Bottom Quick Bar (Tools & Inspector) - only visible when panels are closed */}
          {mobilePanel === 'none' && (
            <div className="lg:hidden absolute bottom-3 inset-x-3 z-20 flex items-center justify-between pointer-events-none">
              <button
                onClick={() => setMobilePanel('left')}
                className="pointer-events-auto flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-primary text-black font-black text-xs shadow-xl shadow-black/50 hover:bg-primary/90 transition-all active:scale-95 cursor-pointer border border-primary/40"
              >
                <FolderOpen className="w-4 h-4 stroke-[2.2]" />
                <span>Library</span>
              </button>

              <button
                onClick={() => setMobilePanel('right')}
                className="pointer-events-auto flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[hsl(var(--surface-1))]/95 backdrop-blur-md border border-white/[0.15] text-zinc-200 hover:text-white font-bold text-xs shadow-xl shadow-black/50 transition-all active:scale-95 cursor-pointer"
              >
                <Sliders className="w-4 h-4 stroke-[2.2] text-primary" />
                <span>Inspector</span>
              </button>
            </div>
          )}
        </div>

        {/* Right Column: Tabbed Inspector (Desktop) */}
        <div className="hidden lg:flex h-full flex-shrink-0">
          <AnimationRightInspector />
        </div>

        {/* Mobile Slide-over Sheet: Left Animation Library & Assets */}
        <AnimatePresence>
          {mobilePanel === 'left' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={MOTION_FAST}
              className="lg:hidden absolute inset-x-2 top-2 bottom-2 z-30 bg-[hsl(var(--surface-0))] rounded-2xl border border-white/[0.1] shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="flex items-center justify-between px-3.5 py-2 border-b border-white/[0.08] bg-[hsl(var(--surface-1))] flex-shrink-0">
                <span className="font-bold text-xs text-white">Animation Library &amp; Assets</span>
                <button
                  onClick={() => setMobilePanel('none')}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <AnimationLeftPanel />
              </div>
            </motion.div>
          )}

          {/* Mobile Slide-over Sheet: Right Inspector & Rigging */}
          {mobilePanel === 'right' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={MOTION_FAST}
              className="lg:hidden absolute inset-x-2 top-2 bottom-2 z-30 bg-[hsl(var(--surface-0))] rounded-2xl border border-white/[0.1] shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="flex items-center justify-between px-3.5 py-2 border-b border-white/[0.08] bg-[hsl(var(--surface-1))] flex-shrink-0">
                <span className="font-bold text-xs text-white">Inspector &amp; Rigging</span>
                <button
                  onClick={() => setMobilePanel('none')}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <AnimationRightInspector />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
