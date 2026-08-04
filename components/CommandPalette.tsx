"use client";


import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, Compass, Box, SlidersHorizontal, HelpCircle,
  Maximize, PanelLeft, PanelRight, PanelBottom, RotateCcw,
  Trash2, LayoutDashboard, ShieldCheck, Settings, Boxes,
  Keyboard, FileText, Bug, Search,
} from 'lucide-react';
import {
  Command,
  CommandInput,
  CommandList,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandEmpty,
} from '@/components/ui/command';
import { useUIStore } from '@/stores/useUIStore';
import { useGenerationStore } from '@/stores/useGenerationStore';
import { toast } from 'sonner';
import type { QualityPreset } from '@/types';

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const paletteVariants = {
  hidden: { opacity: 0, scale: 0.95, y: -10 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: 'spring' as const, damping: 28, stiffness: 400, mass: 0.8 },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: -10,
    transition: { duration: 0.15, ease: [0.4, 0, 1, 1] as [number, number, number, number] },
  },
} as const;

function ShortcutBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="chip text-[10px] font-mono leading-none px-1.5 py-0.5 ml-auto">
      {children}
    </span>
  );
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);

  const {
    toggleFullscreen,
    toggleLeftSidebar,
    toggleRightSidebar,
    toggleBottomPanel,
    resetCamera,
  } = useUIStore();

  const { setPrompt, setSelectedModel, setQuality } = useGenerationStore();

  // Keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const close = useCallback(() => setOpen(false), []);

  const handleAction = useCallback(
    (action: () => void) => {
      action();
      close();
    },
    [close],
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]"
          variants={overlayVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          transition={{ duration: 0.2 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-[hsl(var(--surface-0)/0.6)] backdrop-blur-sm"
            onClick={close}
            aria-hidden="true"
          />

          {/* Palette */}
          <motion.div
            className="relative w-full max-w-lg glass-ultra glow-border shadow-premium-lg rounded-xl overflow-hidden"
            variants={paletteVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
          >
            <Command
              className="rounded-xl bg-transparent"
              shouldFilter={true}
            >
              <div className="flex items-center border-b border-[hsl(var(--border)/0.4)] px-3">
                <Search className="w-4 h-4 text-muted-foreground shrink-0 mr-2" />
                <CommandInput
                  placeholder="Type a command or search..."
                  className="input-premium h-11 border-0 px-0 text-sm text-foreground"
                />
              </div>

              <CommandList className="max-h-[360px] px-2 py-1">
                <CommandEmpty className="py-8 text-muted-foreground text-sm">
                  No commands found.
                </CommandEmpty>

                {/* ─── Actions ─── */}
                <CommandGroup heading="Actions" className="panel-section-label">
                  <CommandItem
                    onSelect={() =>
                      handleAction(() => {
                        toast.info('Enter a prompt in the left panel and click Generate.');
                      })
                    }
                    className="rounded-lg px-3 py-2.5 cursor-pointer data-[selected=true]:bg-[hsl(var(--neon-purple)/0.1)] data-[selected=true]:text-foreground transition-colors duration-150"
                  >
                    <Sparkles className="w-4 h-4 mr-2 text-[hsl(var(--neon-purple))]" />
                    <span>Generate 3D Model</span>
                    <ShortcutBadge>⌘G</ShortcutBadge>
                  </CommandItem>

                  <CommandItem
                    onSelect={() => handleAction(toggleFullscreen)}
                    className="rounded-lg px-3 py-2.5 cursor-pointer data-[selected=true]:bg-[hsl(var(--neon-purple)/0.1)] data-[selected=true]:text-foreground transition-colors duration-150"
                  >
                    <Maximize className="w-4 h-4 mr-2 text-muted-foreground" />
                    <span>Toggle Fullscreen</span>
                    <ShortcutBadge>F11</ShortcutBadge>
                  </CommandItem>

                  <CommandItem
                    onSelect={() => handleAction(toggleLeftSidebar)}
                    className="rounded-lg px-3 py-2.5 cursor-pointer data-[selected=true]:bg-[hsl(var(--neon-purple)/0.1)] data-[selected=true]:text-foreground transition-colors duration-150"
                  >
                    <PanelLeft className="w-4 h-4 mr-2 text-muted-foreground" />
                    <span>Toggle Left Panel</span>
                    <ShortcutBadge>⌘B</ShortcutBadge>
                  </CommandItem>

                  <CommandItem
                    onSelect={() => handleAction(toggleRightSidebar)}
                    className="rounded-lg px-3 py-2.5 cursor-pointer data-[selected=true]:bg-[hsl(var(--neon-purple)/0.1)] data-[selected=true]:text-foreground transition-colors duration-150"
                  >
                    <PanelRight className="w-4 h-4 mr-2 text-muted-foreground" />
                    <span>Toggle Right Panel</span>
                    <ShortcutBadge>⌘.</ShortcutBadge>
                  </CommandItem>

                  <CommandItem
                    onSelect={() => handleAction(toggleBottomPanel)}
                    className="rounded-lg px-3 py-2.5 cursor-pointer data-[selected=true]:bg-[hsl(var(--neon-purple)/0.1)] data-[selected=true]:text-foreground transition-colors duration-150"
                  >
                    <PanelBottom className="w-4 h-4 mr-2 text-muted-foreground" />
                    <span>Toggle Bottom Dock</span>
                    <ShortcutBadge>⌘J</ShortcutBadge>
                  </CommandItem>

                  <CommandItem
                    onSelect={() => handleAction(resetCamera)}
                    className="rounded-lg px-3 py-2.5 cursor-pointer data-[selected=true]:bg-[hsl(var(--neon-purple)/0.1)] data-[selected=true]:text-foreground transition-colors duration-150"
                  >
                    <RotateCcw className="w-4 h-4 mr-2 text-muted-foreground" />
                    <span>Reset Camera</span>
                    <ShortcutBadge>R</ShortcutBadge>
                  </CommandItem>

                  <CommandItem
                    onSelect={() => handleAction(() => setPrompt(''))}
                    className="rounded-lg px-3 py-2.5 cursor-pointer data-[selected=true]:bg-[hsl(var(--neon-purple)/0.1)] data-[selected=true]:text-foreground transition-colors duration-150"
                  >
                    <Trash2 className="w-4 h-4 mr-2 text-muted-foreground" />
                    <span>Clear Prompt</span>
                  </CommandItem>
                </CommandGroup>

                <CommandSeparator className="my-1" />

                {/* ─── Navigation ─── */}
                <CommandGroup heading="Navigation" className="panel-section-label">
                  <CommandItem
                    onSelect={() =>
                      handleAction(() => {
                        toast.info('You are already on the Workspace.');
                      })
                    }
                    className="rounded-lg px-3 py-2.5 cursor-pointer data-[selected=true]:bg-[hsl(var(--neon-purple)/0.1)] data-[selected=true]:text-foreground transition-colors duration-150"
                  >
                    <LayoutDashboard className="w-4 h-4 mr-2 text-muted-foreground" />
                    <span>Go to Workspace</span>
                    <ShortcutBadge>⌘1</ShortcutBadge>
                  </CommandItem>

                  <CommandItem
                    onSelect={() =>
                      handleAction(() => {
                        toast.info('Admin panel available in full app.');
                      })
                    }
                    className="rounded-lg px-3 py-2.5 cursor-pointer data-[selected=true]:bg-[hsl(var(--neon-purple)/0.1)] data-[selected=true]:text-foreground transition-colors duration-150"
                  >
                    <ShieldCheck className="w-4 h-4 mr-2 text-muted-foreground" />
                    <span>Go to Admin Panel</span>
                    <ShortcutBadge>⌘2</ShortcutBadge>
                  </CommandItem>

                  <CommandItem
                    onSelect={() =>
                      handleAction(() => {
                        toast.info('Models library coming soon.');
                      })
                    }
                    className="rounded-lg px-3 py-2.5 cursor-pointer data-[selected=true]:bg-[hsl(var(--neon-purple)/0.1)] data-[selected=true]:text-foreground transition-colors duration-150"
                  >
                    <Boxes className="w-4 h-4 mr-2 text-muted-foreground" />
                    <span>Go to Models</span>
                    <ShortcutBadge>⌘3</ShortcutBadge>
                  </CommandItem>

                  <CommandItem
                    onSelect={() =>
                      handleAction(() => {
                        toast.info('Settings panel coming soon.');
                      })
                    }
                    className="rounded-lg px-3 py-2.5 cursor-pointer data-[selected=true]:bg-[hsl(var(--neon-purple)/0.1)] data-[selected=true]:text-foreground transition-colors duration-150"
                  >
                    <Settings className="w-4 h-4 mr-2 text-muted-foreground" />
                    <span>Go to Settings</span>
                    <ShortcutBadge>⌘,</ShortcutBadge>
                  </CommandItem>
                </CommandGroup>

                <CommandSeparator className="my-1" />

                {/* ─── Quick Models ─── */}
                <CommandGroup heading="Quick Models" className="panel-section-label">
                  <CommandItem
                    onSelect={() =>
                      handleAction(() => {
                        setSelectedModel('trellis');
                        toast.success('Trellis selected');
                      })
                    }
                    className="rounded-lg px-3 py-2.5 cursor-pointer data-[selected=true]:bg-[hsl(var(--neon-purple)/0.1)] data-[selected=true]:text-foreground transition-colors duration-150"
                  >
                    <Box className="w-4 h-4 mr-2 text-[hsl(var(--neon-blue))]" />
                    <span>Select Trellis</span>
                  </CommandItem>

                  <CommandItem
                    onSelect={() =>
                      handleAction(() => {
                        setSelectedModel('hunyuan3d');
                        toast.success('Hunyuan3D selected');
                      })
                    }
                    className="rounded-lg px-3 py-2.5 cursor-pointer data-[selected=true]:bg-[hsl(var(--neon-purple)/0.1)] data-[selected=true]:text-foreground transition-colors duration-150"
                  >
                    <Box className="w-4 h-4 mr-2 text-[hsl(var(--neon-cyan))]" />
                    <span>Select Hunyuan3D</span>
                  </CommandItem>

                  <CommandItem
                    onSelect={() =>
                      handleAction(() => {
                        setSelectedModel('triposr');
                        toast.success('TripoSR selected');
                      })
                    }
                    className="rounded-lg px-3 py-2.5 cursor-pointer data-[selected=true]:bg-[hsl(var(--neon-purple)/0.1)] data-[selected=true]:text-foreground transition-colors duration-150"
                  >
                    <Box className="w-4 h-4 mr-2 text-[hsl(var(--neon-green))]" />
                    <span>Select TripoSR</span>
                  </CommandItem>

                  <CommandItem
                    onSelect={() =>
                      handleAction(() => {
                        setSelectedModel('instantmesh');
                        toast.success('InstantMesh selected');
                      })
                    }
                    className="rounded-lg px-3 py-2.5 cursor-pointer data-[selected=true]:bg-[hsl(var(--neon-purple)/0.1)] data-[selected=true]:text-foreground transition-colors duration-150"
                  >
                    <Box className="w-4 h-4 mr-2 text-[hsl(var(--neon-amber))]" />
                    <span>Select InstantMesh</span>
                  </CommandItem>
                </CommandGroup>

                <CommandSeparator className="my-1" />

                {/* ─── Quality Presets ─── */}
                <CommandGroup heading="Quality Presets" className="panel-section-label">
                  <CommandItem
                    onSelect={() =>
                      handleAction(() => {
                        setQuality('low-poly' as QualityPreset);
                        toast.success('Quality set to Low Poly');
                      })
                    }
                    className="rounded-lg px-3 py-2.5 cursor-pointer data-[selected=true]:bg-[hsl(var(--neon-purple)/0.1)] data-[selected=true]:text-foreground transition-colors duration-150"
                  >
                    <SlidersHorizontal className="w-4 h-4 mr-2 text-muted-foreground" />
                    <span>Set Quality: Low Poly</span>
                  </CommandItem>

                  <CommandItem
                    onSelect={() =>
                      handleAction(() => {
                        setQuality('standard' as QualityPreset);
                        toast.success('Quality set to Standard');
                      })
                    }
                    className="rounded-lg px-3 py-2.5 cursor-pointer data-[selected=true]:bg-[hsl(var(--neon-purple)/0.1)] data-[selected=true]:text-foreground transition-colors duration-150"
                  >
                    <SlidersHorizontal className="w-4 h-4 mr-2 text-muted-foreground" />
                    <span>Set Quality: Standard</span>
                  </CommandItem>

                  <CommandItem
                    onSelect={() =>
                      handleAction(() => {
                        setQuality('high-poly' as QualityPreset);
                        toast.success('Quality set to High Poly');
                      })
                    }
                    className="rounded-lg px-3 py-2.5 cursor-pointer data-[selected=true]:bg-[hsl(var(--neon-purple)/0.1)] data-[selected=true]:text-foreground transition-colors duration-150"
                  >
                    <SlidersHorizontal className="w-4 h-4 mr-2 text-muted-foreground" />
                    <span>Set Quality: High Poly</span>
                  </CommandItem>
                </CommandGroup>

                <CommandSeparator className="my-1" />

                {/* ─── Help ─── */}
                <CommandGroup heading="Help" className="panel-section-label">
                  <CommandItem
                    onSelect={() =>
                      handleAction(() => {
                        toast.info('⌘K — Command Palette | ⌘B — Toggle Left Panel | R — Reset Camera');
                      })
                    }
                    className="rounded-lg px-3 py-2.5 cursor-pointer data-[selected=true]:bg-[hsl(var(--neon-purple)/0.1)] data-[selected=true]:text-foreground transition-colors duration-150"
                  >
                    <Keyboard className="w-4 h-4 mr-2 text-muted-foreground" />
                    <span>Show Keyboard Shortcuts</span>
                    <ShortcutBadge>?</ShortcutBadge>
                  </CommandItem>

                  <CommandItem
                    onSelect={() =>
                      handleAction(() => {
                        toast.info('Documentation coming soon.');
                      })
                    }
                    className="rounded-lg px-3 py-2.5 cursor-pointer data-[selected=true]:bg-[hsl(var(--neon-purple)/0.1)] data-[selected=true]:text-foreground transition-colors duration-150"
                  >
                    <FileText className="w-4 h-4 mr-2 text-muted-foreground" />
                    <span>View Documentation</span>
                  </CommandItem>

                  <CommandItem
                    onSelect={() =>
                      handleAction(() => {
                        toast.info('Bug report form coming soon.');
                      })
                    }
                    className={`rounded-lg px-3 py-2.5 cursor-pointer data-[selected=true]:bg-[hsl(var(--neon-purple)/0.1)] data-[selected=true]:text-foreground transition-colors duration-150`}
                  >
                    <Bug className="w-4 h-4 mr-2 text-muted-foreground" />
                    <span>Report Bug</span>
                  </CommandItem>
                </CommandGroup>
              </CommandList>
            </Command>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}