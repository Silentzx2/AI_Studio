'use client';

import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { Toaster } from 'sonner';
import { TopHeader } from '../new-workspace/Header/TopHeader';
import { LeftNavigation } from '../new-workspace/Navigation/LeftNavigation';
import { WorkspaceProvider } from '../new-workspace/store/WorkspaceContext';
import { WorldGenToolBar } from './Panels/WorldGenToolBar';
import { PropertiesPanel } from './Panels/PropertiesPanel';
import { WorldMeshViewer } from './Viewport/WorldMeshViewer';
import type {
  WorldGenSettings,
  WorldGenStyle,
  ViewportMode,
} from './types';

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

  return (
    <WorkspaceProvider>
      <div
        id="worldgen-root"
        className="flex flex-col h-screen w-screen overflow-hidden bg-[var(--ws-bg,#0d0e12)] text-[var(--ws-text,#f3f4f6)]"
      >
      <TopHeader />
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

      <div className="flex flex-1 overflow-hidden">
        <LeftNavigation />
        {/* Left settings panel with smooth slide transition */}
        <AnimatePresence initial={false}>
          {isLeftOpen && (
            <motion.aside
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className="w-80 h-full bg-[#0f1015] border-r border-[#1a1d26] flex flex-col flex-shrink-0 z-10 overflow-hidden"
            >
              <div className="h-9 px-3 flex items-center justify-between border-b border-[#1a1d26] bg-[#0c0d12]">
                <span className="text-[10px] font-bold tracking-wider text-[#9ca3af] uppercase">Settings</span>
                <button
                  onClick={() => setIsLeftOpen(false)}
                  title="Collapse panel"
                  className="p-1 rounded-md text-[#6b7280] hover:text-[#f5c518] hover:bg-[#1a1d26] transition-colors"
                >
                  <PanelLeftClose className="w-4 h-4" />
                </button>
              </div>
              <WorldGenToolBar settings={settings} onChange={patchSettings} />
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Center viewport - auto-expands when panels collapse */}
        <main className="flex-1 h-full relative overflow-hidden bg-[#0a0b0e]">
          <WorldMeshViewer
            mode={mode}
            showGrid={showGrid}
            turntable={turntable}
            onToggleGrid={() => setShowGrid((p) => !p)}
            onToggleTurntable={() => setTurntable((p) => !p)}
          />

          {/* Left collapsed toggle - appears at viewport edge when panel is closed */}
          {!isLeftOpen && (
            <div className="absolute left-0 top-1/2 -translate-y-1/2 z-20">
              <button
                onClick={() => setIsLeftOpen(true)}
                title="Open Settings"
                className="w-6 h-14 rounded-r-lg bg-[#16181f] border border-l-0 border-[#272b36] text-[#6b7280] hover:text-[#f5c518] transition-colors flex items-center justify-center"
              >
                <PanelLeftOpen className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {/* Right collapsed toggle - appears at viewport edge when panel is closed */}
          {!isRightOpen && (
            <div className="absolute right-0 top-1/2 -translate-y-1/2 z-20">
              <button
                onClick={() => setIsRightOpen(true)}
                title="Open Properties"
                className="w-6 h-14 rounded-l-lg bg-[#16181f] border border-r-0 border-[#272b36] text-[#6b7280] hover:text-[#f5c518] transition-colors flex items-center justify-center"
              >
                <PanelRightOpen className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </main>

        {/* Right properties panel with smooth slide transition */}
        <AnimatePresence initial={false}>
          {isRightOpen && (
            <motion.aside
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className="w-80 h-full bg-[#0f1015] border-l border-[#1a1d26] flex flex-col flex-shrink-0 z-10 overflow-hidden"
            >
              <div className="h-9 px-3 flex items-center justify-between border-b border-[#1a1d26] bg-[#0c0d12]">
                <span className="text-[10px] font-bold tracking-wider text-[#9ca3af] uppercase">Properties</span>
                <button
                  onClick={() => setIsRightOpen(false)}
                  title="Collapse panel"
                  className="p-1 rounded-md text-[#6b7280] hover:text-[#f5c518] hover:bg-[#1a1d26] transition-colors"
                >
                  <PanelRightClose className="w-4 h-4" />
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
      </div>
      </div>
      <Toaster position="bottom-right" richColors />
    </WorkspaceProvider>
  );
};

export default WorldGenShell;
