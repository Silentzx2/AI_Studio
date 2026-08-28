'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { WorldGenHeader } from './Header/WorldGenHeader';
import { UploadPanel } from './Panels/UploadPanel';
import { PropertiesPanel } from './Panels/PropertiesPanel';
import { WorldViewer } from './Viewport/WorldViewer';
import type {
  WorldGenSettings,
  WorldGenStyle,
  ViewportMode,
} from './types';

const DEFAULT_SETTINGS: WorldGenSettings = {
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
  environmentUpload: null,
};

export const WorldGenShell: React.FC = () => {
  const [settings, setSettings] = useState<WorldGenSettings>(DEFAULT_SETTINGS);
  const [isLeftOpen, setIsLeftOpen] = useState(true);
  const [isRightOpen, setIsRightOpen] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [turntable, setTurntable] = useState(false);
  const [mode, setMode] = useState<ViewportMode>('world');

  const generateFileInputRef = useRef<HTMLInputElement>(null);

  const patchSettings = (patch: Partial<WorldGenSettings>) =>
    setSettings((p) => ({ ...p, ...patch }));

  const handlePanelOpen = () => generateFileInputRef.current?.click();

  const handleGenerate = () => {
    if (!settings.environmentUpload) {
      generateFileInputRef.current?.click();
    }
    // UI-only page: no generation logic.
  };

  return (
    <div
      id="worldgen-root"
      className="flex flex-col h-screen w-screen overflow-hidden bg-[var(--ws-bg,#0d0e12)] text-[var(--ws-text,#f3f4f6)]"
    >
      <WorldGenHeader onGenerate={handleGenerate} onOpen={handlePanelOpen} />
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
              environmentUpload: { name: file.name, previewUrl, sizeBytes: file.size },
            });
          }
          e.target.value = '';
        }}
      />

      <div className="flex flex-1 overflow-hidden relative">
        {/* Left settings panel */}
        {isLeftOpen && (
          <aside
            className="w-80 h-full bg-[var(--ws-panel,#101115)] border-r border-[var(--ws-border,#21242c)] flex flex-col flex-shrink-0 z-10 overflow-hidden"
          >
            <div className="panel-header">
              <span className="panel-section-label">Settings</span>
              <button
                onClick={() => setIsLeftOpen(!isLeftOpen)}
                title="Collapse panel"
                className="p-1 rounded-md text-[var(--ws-text-muted,#8e95a5)] hover:text-[var(--ws-text,#f3f4f6)] hover:bg-[var(--ws-hover-bg,#1f232e)] transition-colors"
              >
                <span className="text-sm leading-none">»</span>
              </button>
            </div>
            <UploadPanel settings={settings} onChange={patchSettings} />
          </aside>
        )}

        {/* Center viewport */}
        <main className="flex-1 h-full relative overflow-hidden bg-[#0a0b0e]">
          <WorldViewer
            mode={mode}
            showGrid={showGrid}
            turntable={turntable}
            onToggleGrid={() => setShowGrid((p) => !p)}
            onToggleTurntable={() => setTurntable((p) => !p)}
          />

          {/* Drawer toggles when panels are collapsed */}
          <div className="absolute left-0 top-1/2 -translate-y-1/2 z-20">
            {!isLeftOpen && (
              <button
                onClick={() => setIsLeftOpen(true)}
                title="Open Settings"
                className="w-7 h-16 rounded-r-xl bg-[#16181f] border border-l-0 border-[#272b36] text-[#9ca3af] hover:text-[#f5c518] transition-colors flex items-center justify-center"
              >
                <span className="text-xs">«</span>
              </button>
            )}
          </div>
        </main>

        {/* Right properties panel */}
        <AnimatePresence>
          {isRightOpen && (
            <motion.aside
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.15 }}
              className="w-80 h-full bg-[var(--ws-panel,#101115)] border-l border-[var(--ws-border,#21242c)] flex flex-col flex-shrink-0 z-10 overflow-hidden"
            >
              <div className="panel-header">
                <span className="panel-section-label">Properties</span>
                <button
                  onClick={() => setIsRightOpen(!isRightOpen)}
                  title="Collapse panel"
                  className="p-1 rounded-md text-[var(--ws-text-muted,#8e95a5)] hover:text-[var(--ws-text,#f3f4f6)] hover:bg-[var(--ws-hover-bg,#1f232e)] transition-colors"
                >
                  <span className="text-sm leading-none">«</span>
                </button>
              </div>
              <PropertiesPanel
                style={settings.style}
                autoOptimize={settings.autoOptimize}
                textureAtlas={settings.textureAtlas}
                onStyleChange={(s: WorldGenStyle) => patchSettings({ style: s })}
                onToggleOptimize={() => patchSettings({ autoOptimize: !settings.autoOptimize })}
                onToggleAtlas={() => patchSettings({ textureAtlas: !settings.textureAtlas })}
              />
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Right collapsed toggle */}
        {!isRightOpen && (
          <div className="absolute right-0 top-1/2 -translate-y-1/2 z-20">
            <button
              onClick={() => setIsRightOpen(true)}
              title="Open Properties"
              className="w-7 h-16 rounded-l-xl bg-[#16181f] border border-r-0 border-[#272b36] text-[#9ca3af] hover:text-[#f5c518] transition-colors flex items-center justify-center"
            >
              <span className="text-xs">»</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default WorldGenShell;
