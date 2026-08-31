'use client';

import React, { useRef, useState, useEffect } from 'react';
import { Sparkles, AlertTriangle, Check } from 'lucide-react';
import { WorldGenToolBar } from '@/features/WORLDGEN/Panels/WorldGenToolBar';
import { useWorkspace } from '@/features/new-workspace/store/WorkspaceContext';
import { useManifestModels } from '@/hooks/useManifestModels';
import type { WorldGenSettings } from '@/features/WORLDGEN/types';
import { toast } from 'sonner';

const DEFAULT_SETTINGS: WorldGenSettings = {
  prompt: '',
  mood: 'fantasy',
  shape: 'hills',
  style: 'stylized',
  preset: 'balanced',
  resolution: '2K',
  seed: 17,
  guidance: 7.5,
  size: 4.0,
  density: 0.55,
  autoOptimize: true,
  textureAtlas: true,
  referenceImage: null,
  environmentUpload: null,
};

export const WorldGenToolPanel: React.FC = () => {
  const [settings, setSettings] = useState<WorldGenSettings>(DEFAULT_SETTINGS);
  const generateFileInputRef = useRef<HTMLInputElement>(null);

  const {
    isExecuting,
    executionProgress,
    executionStep,
    generateImageTo3D,
    activeTask,
    setGenerationSettings,
  } = useWorkspace();

  // WorldGen uses exactly one model — check its status
  const { worldgenModel } = useManifestModels();

  useEffect(() => {
    setGenerationSettings(prev => ({ ...prev, aiModel: 'worldgen' }));
  }, [setGenerationSettings]);

  const patchSettings = (patch: Partial<WorldGenSettings>) =>
    setSettings((p) => ({ ...p, ...patch }));

  const handleGenerate = () => {
    if (!settings.referenceImage) {
      toast.error('Please upload a reference image');
      return;
    }
    generateImageTo3D(settings.referenceImage?.previewUrl);
  };

  const handleImageUpload = () => {
    generateFileInputRef.current?.click();
  };

  useEffect(() => {
    if (activeTask?.status === 'failed') {
      toast.error('Generation failed');
    }
  }, [activeTask?.status]);

  // Determine status message for the pill
  const getStatusInfo = () => {
    if (!worldgenModel) return null;
    if (worldgenModel.available) return null; // ready → no pill
    if (worldgenModel.status === 'not_installed' || !worldgenModel.installed) {
      return { label: 'Model not installed', tone: 'warn' as const };
    }
    if (worldgenModel.status === 'weights_missing') {
      return { label: 'Weights missing', tone: 'warn' as const };
    }
    if (worldgenModel.status) {
      return { label: worldgenModel.status, tone: 'warn' as const };
    }
    return { label: 'Not ready', tone: 'warn' as const };
  };

  const statusInfo = getStatusInfo();

  return (
    <>
      <input
        ref={generateFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            const previewUrl = URL.createObjectURL(file);
            patchSettings({
              referenceImage: { name: file.name, previewUrl, sizeBytes: file.size },
            });
          }
          e.target.value = '';
        }}
      />
      <div id="panel-worldgen" className="flex flex-col h-full bg-[#191A1D] text-xs select-none">
        <div className="px-3 py-2.5 border-b border-white/[0.08] flex items-center justify-between flex-shrink-0">
          <span className="font-bold text-[11px] text-white flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#F9CF00]" />
            <span>World Generation</span>
          </span>
          {/* Status pill — only shows when there's an issue */}
          {statusInfo ? (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[9px] font-bold">
              <AlertTriangle className="w-2.5 h-2.5" />
              {statusInfo.label}
            </span>
          ) : worldgenModel?.available ? (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[9px] font-bold">
              <Check className="w-2.5 h-2.5" />
              Ready
            </span>
          ) : null}
        </div>
        <div className="flex-1 overflow-hidden">
          <WorldGenToolBar
            settings={settings}
            onChange={patchSettings}
            onGenerate={handleGenerate}
            isExecuting={isExecuting}
            executionProgress={executionProgress}
            executionStep={executionStep}
            generationMode="image"
            onGenerationModeChange={() => {}}
            onImageUpload={handleImageUpload}
          />
        </div>
      </div>
    </>
  );
};

export default WorldGenToolPanel;
