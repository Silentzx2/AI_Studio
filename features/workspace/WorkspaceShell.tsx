"use client";


import { useEffect, useState, Suspense } from 'react';
import { WorkspaceNavbar } from './WorkspaceNavbar';
import { useUIStore } from '@/stores/useUIStore';
import { motion, AnimatePresence } from 'framer-motion';
import AnimatedBackground from '@/components/AnimatedBackground';
import { KeyboardShortcuts } from '@/components/KeyboardShortcuts';
import { WelcomeOverlay } from '@/components/WelcomeOverlay';
import { CommandPalette } from '@/components/CommandPalette';
import CreativeWorkspaceLayout from './new-ui/CreativeWorkspaceLayout';
import { useTaskManager } from '@/hooks/useTaskManager';

function WorkspaceShellContent({ defaultTab }: { defaultTab?: string }) {
  const viewerFullscreen = useUIStore((s) => s.viewer.fullscreen);
  const toggleFullscreen = useUIStore((s) => s.toggleFullscreen);
  const { reconnectToRunningTasks } = useTaskManager();

  const [showShortcuts, setShowShortcuts] = useState(false);

  useEffect(() => {
    reconnectToRunningTasks();
  }, [reconnectToRunningTasks]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
        setShowShortcuts(prev => !prev);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && viewerFullscreen) {
        toggleFullscreen();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewerFullscreen, toggleFullscreen]);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[hsl(var(--surface-1))] relative">
      <div className="relative z-[3] flex flex-col h-full">
        <WorkspaceNavbar />
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <CreativeWorkspaceLayout defaultTab={defaultTab} />
        </div>
        <CommandPalette />
      </div>

      <KeyboardShortcuts open={showShortcuts} onOpenChange={setShowShortcuts} />
      <WelcomeOverlay />
    </div>
  );
}

export function WorkspaceShell({ defaultTab }: { defaultTab?: string } = {}) {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center bg-[hsl(var(--surface-0))]"><div className="text-white">Loading workspace...</div></div>}>
      <WorkspaceShellContent defaultTab={defaultTab} />
    </Suspense>
  );
}