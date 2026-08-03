"use client";


import { useEffect } from 'react';
import {
  RotateCcw, Grid3X3, Maximize2, Minimize2, BarChart2,
  Box, Layers, RefreshCw, Eye, Move, ZoomIn, Camera, Sun,
  PenTool, Upload
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useUIStore } from '@/stores/useUIStore';
import { cn } from '@/lib/utils';

function ToolbarButton({ icon: Icon, label, active, onClick }: { icon: React.ComponentType<{ className?: string }>; label: string; active?: boolean; onClick: () => void }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button onClick={onClick} className={cn(
            'flex items-center justify-center w-7 h-7 rounded-md text-sm transition-all duration-200 ease-out touch-target',
            'hover:scale-110 active:scale-95',
            active
              ? 'bg-[hsl(var(--neon-purple)/0.2)] text-[hsl(var(--neon-purple))] border border-[hsl(var(--neon-purple)/0.4)]'
              : 'text-muted-foreground hover:text-foreground hover:bg-white/8 border border-transparent'
          )} style={active ? { boxShadow: '0 0 8px hsl(var(--neon-purple)/0.4), 0 0 20px hsl(var(--neon-purple)/0.15), 0 0 40px hsl(var(--neon-purple)/0.05), inset 0 0 8px hsl(var(--neon-purple)/0.1)' } : {}}>
            <Icon className="w-3.5 h-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-[10px] tooltip-premium" style={{ boxShadow: '0 4px 20px hsl(var(--surface-0) / 0.5), 0 0 15px hsl(var(--neon-purple) / 0.08)' }}>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function Divider() {
  return <div className="w-px h-4 mx-0.5 hidden sm:block" style={{ background: 'linear-gradient(180deg, transparent, hsl(var(--neon-purple) / 0.2), hsl(var(--neon-blue) / 0.2), transparent)' }} />;
}

export function ViewerToolbar() {
  const {
    viewer, setViewerMode, toggleAutoRotate, toggleGrid,
    toggleWireframe, toggleFullscreen, toggleStats, resetCamera
  } = useUIStore();

  // ESC key to exit fullscreen (also handled in WorkspaceShell)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && viewer.fullscreen) {
        toggleFullscreen();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewer.fullscreen, toggleFullscreen]);

  return (
    <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-20 pointer-events-none gap-2">
      {/* Left group: View mode tools */}
      <div className="flex items-center gap-0.5 px-1.5 py-1 rounded-xl glass-strong border border-[hsl(var(--border)/0.5)] pointer-events-auto overflow-x-auto no-scrollbar shadow-premium glow-border" style={{ boxShadow: '0 1px 2px hsl(var(--surface-0)/0.6), 0 4px 8px hsl(var(--surface-0)/0.35), 0 8px 24px hsl(var(--surface-0)/0.2), inset 0 1px 0 hsl(var(--foreground)/0.05)' }}>
        <ToolbarButton icon={Box} label="Orbit" active={viewer.mode === 'solid'} onClick={() => setViewerMode('solid')} />
        <ToolbarButton icon={Move} label="Pan" active={false} onClick={resetCamera} />
        <ToolbarButton icon={ZoomIn} label="Zoom" active={false} onClick={resetCamera} />
        <ToolbarButton icon={Camera} label="Camera" active={false} onClick={resetCamera} />
        <Divider />
        <ToolbarButton icon={Sun} label="HDRI" active={false} onClick={() => {}} />
        <ToolbarButton icon={Grid3X3} label="Grid" active={viewer.showGrid} onClick={toggleGrid} />
        <ToolbarButton icon={Layers} label="Wireframe" active={viewer.showWireframe} onClick={toggleWireframe} />
        <ToolbarButton icon={PenTool} label="Material" active={viewer.mode === 'material'} onClick={() => setViewerMode('material')} />
        <ToolbarButton icon={Eye} label="Texture" active={viewer.mode === 'texture'} onClick={() => setViewerMode('texture')} />
      </div>

      {/* Right group: Utilities */}
      <div className="flex items-center gap-0.5 px-1.5 py-1 rounded-xl glass-strong border border-[hsl(var(--border)/0.5)] pointer-events-auto shrink-0 shadow-premium glow-border" style={{ boxShadow: '0 1px 2px hsl(var(--surface-0)/0.6), 0 4px 8px hsl(var(--surface-0)/0.35), 0 8px 24px hsl(var(--surface-0)/0.2), inset 0 1px 0 hsl(var(--foreground)/0.05)' }}>
        <ToolbarButton icon={RefreshCw} label="Auto Rotate" active={viewer.autoRotate} onClick={toggleAutoRotate} />
        <ToolbarButton icon={RotateCcw} label="Reset Camera" onClick={resetCamera} />
        <Divider />
        <ToolbarButton
          icon={Upload}
          label="Load GLB Model"
          active={false}
          onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.glb,.gltf';
            input.onchange = (e) => {
              const file = (e.target as HTMLInputElement).files?.[0];
              if (file) {
                const url = URL.createObjectURL(file);
                window.dispatchEvent(new CustomEvent('load-glb-model', { detail: { url } }));
              }
            };
            input.click();
          }}
        />
        <ToolbarButton icon={BarChart2} label="Performance Stats" active={viewer.showStats} onClick={toggleStats} />
        <ToolbarButton
          icon={viewer.fullscreen ? Minimize2 : Maximize2}
          label={viewer.fullscreen ? 'Exit Fullscreen (ESC)' : 'Fullscreen'}
          onClick={toggleFullscreen}
        />
      </div>
    </div>
  );
}