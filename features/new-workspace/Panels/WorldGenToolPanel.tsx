'use client';

import React, { useRef, useState, useEffect } from 'react';
import { WorldGenToolBar } from '@/features/WORLDGEN/Panels/WorldGenToolBar';
import { useWorkspace } from '@/features/new-workspace/store/WorkspaceContext';
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
    assets,
    setGenerationSettings,
  } = useWorkspace();

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
    </>
  );
};

export default WorldGenToolPanel;