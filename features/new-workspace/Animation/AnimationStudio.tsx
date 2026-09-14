'use client';

import React from 'react';
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
} from 'lucide-react';
import { useAnimationStore, AnimationStudioMode } from '@/stores/useAnimationStore';
import { useWorkspace } from '../store/WorkspaceContext';
import { AnimationLeftPanel } from './AnimationLeftPanel';
import { AnimationViewportStage } from './AnimationViewportStage';
import { AnimationRightInspector } from './AnimationRightInspector';
import { toast } from 'sonner';

export const AnimationStudio: React.FC = () => {
  const { navigateToTool, currentAsset, setIsExportModalOpen } = useWorkspace();
  const {
    activeMode,
    setActiveMode,
    setInspectorTab,
    rigStatus,
  } = useAnimationStore();

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
    toast.success('Animation Project Saved', {
      description: 'Saved current skeleton, poses, and animation timeline to local storage',
    });
  };

  const handleShare = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      toast.success('Link Copied to Clipboard', {
        description: 'Shareable workspace URL is ready',
      });
    } else {
      toast.info('Share URL: ' + window.location.href);
    }
  };

  const modelName = currentAsset?.name || 'character.glb';

  return (
    <div className="flex flex-col h-full w-full bg-[#0D0E11] text-[#E0E2E8] overflow-hidden select-none">
      {/* PAGE SUB-HEADER (Breadcrumb, Title, Model Pill, Actions, Mode Tabs) */}
      <div className="flex-shrink-0 bg-[#121418] border-b border-white/[0.08] px-4 py-2.5 flex flex-col gap-2.5">
        {/* Top Line: Title & Actions */}
        <div className="flex items-center justify-between">
          {/* Left: Back Arrow + Page Header */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigateToTool('model')}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              aria-label="Back to Model Generation"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-extrabold text-white tracking-wide">
                  Animation Studio
                </h1>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#F9CF00]/10 text-[#F9CF00] border border-[#F9CF00]/20 uppercase tracking-wider">
                  Motion AI
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Rig, animate and bring your 3D models to life with AI.
              </p>
            </div>
          </div>

          {/* Right: Active Model Badge & Actions (Save, Share, Export) */}
          <div className="flex items-center gap-2">
            {/* Active Model Pill */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-[#17191F] border border-white/[0.08] rounded-xl text-xs">
              <Box className="w-3.5 h-3.5 text-[#F9CF00]" />
              <span className="font-semibold text-zinc-200">{modelName}</span>
              <span className="text-zinc-500">•</span>
              <span className="text-zinc-400">48,532 Polys</span>
              <span className="text-zinc-500">•</span>
              <span className="text-emerald-400 font-semibold capitalize flex items-center gap-1">
                {rigStatus === 'rigged' ? 'Rigged' : 'Rig Required'}
              </span>
            </div>

            {/* Save Button */}
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1D2026] hover:bg-[#252932] border border-white/[0.08] text-xs font-semibold text-zinc-300 hover:text-white transition-all cursor-pointer shadow-sm"
            >
              <Save className="w-3.5 h-3.5 text-zinc-400" />
              <span>Save</span>
            </button>

            {/* Share Button */}
            <button
              onClick={handleShare}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1D2026] hover:bg-[#252932] border border-white/[0.08] text-xs font-semibold text-zinc-300 hover:text-white transition-all cursor-pointer shadow-sm"
            >
              <Share2 className="w-3.5 h-3.5 text-zinc-400" />
              <span>Share</span>
            </button>

            {/* Primary Yellow Export Button */}
            <button
              onClick={() => setIsExportModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#F9CF00] hover:bg-[#ffe033] text-black font-bold text-xs transition-all shadow-[0_2px_12px_rgba(249,207,0,0.25)] active:scale-95 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export</span>
            </button>
          </div>
        </div>

        {/* Bottom Line: Studio Workspace Mode Selector Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
          {[
            { id: 'animate', label: 'Animate', icon: <Film className="w-3 h-3" /> },
            { id: 'rigging', label: 'Rigging', icon: <Bone className="w-3 h-3" /> },
            { id: 'retarget', label: 'Retarget', icon: <GitCompare className="w-3 h-3" /> },
            { id: 'motion_ai', label: 'Motion AI', icon: <Sparkles className="w-3 h-3" /> },
            { id: 'blend', label: 'Blend', icon: <Layers className="w-3 h-3" /> },
            { id: 'library', label: 'Library', icon: <BookOpen className="w-3 h-3" /> },
          ].map((mode) => {
            const isActive = activeMode === mode.id;
            return (
              <button
                key={mode.id}
                onClick={() => handleModeChange(mode.id as AnimationStudioMode)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#F9CF00] text-black shadow-sm'
                    : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                {mode.icon}
                <span>{mode.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* MAIN 3-COLUMN WORKSPACE BODY */}
      <div className="flex-1 flex overflow-hidden relative min-h-0">
        {/* Left Column: Model & Assets + Animation Library */}
        <AnimationLeftPanel />

        {/* Center Column: 3D Viewport + NLA Timeline */}
        <AnimationViewportStage />

        {/* Right Column: Tabbed Inspector (Properties, Rigging, Animation) */}
        <AnimationRightInspector />
      </div>
    </div>
  );
};
