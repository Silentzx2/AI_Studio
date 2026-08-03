"use client";


import { useEffect, useState, useCallback, Suspense } from 'react';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { WorkspaceNavbar } from './WorkspaceNavbar';
import { LeftSidebar } from './LeftSidebar';
import { RightSidebar } from './RightSidebar';
import { BottomDock } from './BottomDock';
import { CenterWorkspace } from './CenterWorkspace';
import { useUIStore } from '@/stores/useUIStore';
import { Spinner } from '@/components/premium/Spinner';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { PanelLeft, PanelRight, X } from 'lucide-react';
import AnimatedBackground from '@/components/AnimatedBackground';
import { KeyboardShortcuts } from '@/components/KeyboardShortcuts';
import { WelcomeOverlay } from '@/components/WelcomeOverlay';
import { CommandPalette } from '@/components/CommandPalette';
import CreativeWorkspaceLayout from './new-ui/CreativeWorkspaceLayout';

const ThreeDViewer = dynamic(
  () => import('./viewer/ThreeDViewer').then((m) => ({ default: m.ThreeDViewer })),
  {
    ssr: false,
    loading: () => (
      <div className="flex-1 flex items-center justify-center bg-[hsl(var(--surface-0))]">
        <Spinner size="lg" />
      </div>
    )
  }
);

function WorkspaceShellContent() {
  const viewerFullscreen = useUIStore((s) => s.viewer.fullscreen);
  const toggleFullscreen = useUIStore((s) => s.toggleFullscreen);

  const [showShortcuts, setShowShortcuts] = useState(false);

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

  if (viewerFullscreen) {
    return (
      <div className="h-screen flex flex-col overflow-hidden relative bg-[hsl(var(--surface-0))]">
        <AnimatedBackground blobs={false} particles={false} />
        <div className="relative z-[2] flex-1 flex flex-col">
          <ThreeDViewer />
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#09090B] relative">
      <div className="relative z-[3] flex flex-col h-full">
        <WorkspaceNavbar />
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <CreativeWorkspaceLayout />
        </div>
        <CommandPalette />
      </div>

      <KeyboardShortcuts open={showShortcuts} onOpenChange={setShowShortcuts} />
      <WelcomeOverlay />
    </div>
  );
}

export function WorkspaceShell() {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center bg-[hsl(var(--surface-0))]"><div className="text-white">Loading workspace...</div></div>}>
      <WorkspaceShellContent />
    </Suspense>
  );
}