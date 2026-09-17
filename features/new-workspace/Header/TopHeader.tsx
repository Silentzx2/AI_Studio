import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  ChevronDown,
  Layers,
  Bell,
  User,
  Cable,
  Hexagon,
  Zap,
  Package,
  Settings,
  Sparkles,
  Menu,
  Check
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useWorkspace } from '../store/WorkspaceContext';
import { SimpleTooltip } from '@/components/ui/simple-tooltip';
import { AnimatedStatusBadge } from '@/components/animate-ui';
import { motion } from 'motion/react';

interface TopHeaderProps {
  onMobileMenuToggle?: () => void;
  isMobileNavOpen?: boolean;
}

export const TopHeader: React.FC<TopHeaderProps> = ({ onMobileMenuToggle, isMobileNavOpen }) => {
  const router = useRouter();
  const {
    mainNav,
    navigateToMain,
    activeTool,
    navigateToTool,
    systemStats,
    setIsSettingsOpen,
    setIsDccBridgeOpen
  } = useWorkspace();

  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const workspaceMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click or Escape key
  useEffect(() => {
    if (!workspaceMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (workspaceMenuRef.current && !workspaceMenuRef.current.contains(e.target as Node)) {
        setWorkspaceMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setWorkspaceMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [workspaceMenuOpen]);

  return (
    <header
      id="persistent-top-header"
      className="h-[44px] px-2.5 md:px-4 bg-[hsl(var(--surface-0))]/95 backdrop-blur-md flex items-center justify-between border-b border-white/[0.08] select-none z-50 text-xs w-full flex-shrink-0 min-w-0"
    >
      {/* Left Branding & Mode Dropdown */}
      <div className="flex items-center gap-2.5 md:gap-3.5 min-w-0 overflow-hidden">
        {/* Mobile menu button */}
        <button
          onClick={onMobileMenuToggle}
          className="md:hidden p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-[hsl(var(--surface-1))] transition-colors flex-shrink-0 active:scale-95"
          aria-label={isMobileNavOpen ? 'Close menu' : 'Open menu'}
        >
          <Menu className="w-4 h-4" />
        </button>

        {/* Brand Studio Logo (AI 3D Studio) */}
        <div
          onClick={() => navigateToMain('dashboard')}
          className="flex items-center gap-2 cursor-pointer group p-1 flex-shrink-0"
        >
          {/* Stylized Logo Cube */}
          <div className="w-5 h-5 rounded-[5px] bg-primary flex items-center justify-center text-primary-foreground font-black text-[10px] shadow-sm tracking-tighter group-hover:shadow-[0_0_12px_hsl(var(--primary)/0.4)] transition-all">
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <span className="font-extrabold text-xs tracking-wider text-white uppercase font-sans hidden sm:inline group-hover:text-primary transition-colors">
            AI 3D STUDIO
          </span>
        </div>

        {/* 3D Workspace Mode Switcher Dropdown - hidden on mobile */}
        <div ref={workspaceMenuRef} className="relative hidden md:block">
          <button
            id="btn-workspace-switcher"
            onClick={() => setWorkspaceMenuOpen(!workspaceMenuOpen)}
            className="group h-7 px-2.5 rounded-lg bg-[hsl(var(--surface-1))] border border-white/[0.08] flex items-center gap-1.5 hover:bg-[hsl(var(--surface-2))] hover:border-white/[0.14] transition-all active:scale-95 cursor-pointer"
          >
            <span className="text-primary text-[11px] font-bold flex gap-1.5 items-center">
              <span>3D Workspace</span>
              <ChevronDown className={`w-3 h-3 text-zinc-400 group-hover:text-zinc-200 transition-transform duration-200 ${workspaceMenuOpen ? 'rotate-180 text-primary' : ''}`} />
            </span>
          </button>

          {workspaceMenuOpen && (
            <div className="absolute top-full left-0 mt-1.5 w-52 py-1.5 rounded-xl bg-[hsl(var(--surface-1))]/95 backdrop-blur-xl border border-white/[0.12] shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Workspace Modes
              </div>
              <button
                onClick={() => { navigateToTool('model'); setWorkspaceMenuOpen(false); }}
                className={`w-full flex items-center justify-between px-3 py-1.5 text-[11px] transition-colors cursor-pointer ${
                  mainNav === 'workspace' && activeTool === 'model'
                    ? 'bg-[hsl(var(--surface-2))] text-primary font-bold'
                    : 'text-zinc-200 hover:bg-[hsl(var(--surface-2))] hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Box className="w-3.5 h-3.5 text-primary" />
                  <span>3D Model Studio</span>
                </div>
                {mainNav === 'workspace' && activeTool === 'model' && <Check className="w-3.5 h-3.5 text-primary" />}
              </button>
              <button
                onClick={() => { navigateToTool('remesh'); setWorkspaceMenuOpen(false); }}
                className={`w-full flex items-center justify-between px-3 py-1.5 text-[11px] transition-colors cursor-pointer ${
                  mainNav === 'workspace' && activeTool === 'remesh'
                    ? 'bg-[hsl(var(--surface-2))] text-primary font-bold'
                    : 'text-zinc-200 hover:bg-[hsl(var(--surface-2))] hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Hexagon className="w-3.5 h-3.5 text-primary" />
                  <span>Quad Remesh (Poly)</span>
                </div>
                {mainNav === 'workspace' && activeTool === 'remesh' && <Check className="w-3.5 h-3.5 text-primary" />}
              </button>
              <button
                onClick={() => { navigateToTool('texture'); setWorkspaceMenuOpen(false); }}
                className={`w-full flex items-center justify-between px-3 py-1.5 text-[11px] transition-colors cursor-pointer ${
                  mainNav === 'workspace' && activeTool === 'texture'
                    ? 'bg-[hsl(var(--surface-2))] text-primary font-bold'
                    : 'text-zinc-200 hover:bg-[hsl(var(--surface-2))] hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Layers className="w-3.5 h-3.5 text-primary" />
                  <span>PBR Texture Studio</span>
                </div>
                {mainNav === 'workspace' && activeTool === 'texture' && <Check className="w-3.5 h-3.5 text-primary" />}
              </button>
              <button
                onClick={() => { navigateToTool('animation'); setWorkspaceMenuOpen(false); }}
                className={`w-full flex items-center justify-between px-3 py-1.5 text-[11px] transition-colors cursor-pointer ${
                  mainNav === 'workspace' && activeTool === 'animation'
                    ? 'bg-[hsl(var(--surface-2))] text-primary font-bold'
                    : 'text-zinc-200 hover:bg-[hsl(var(--surface-2))] hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  <span>Animation & Rigging</span>
                </div>
                {mainNav === 'workspace' && activeTool === 'animation' && <Check className="w-3.5 h-3.5 text-primary" />}
              </button>
            </div>
          )}
        </div>

        {/* Divider - hidden on mobile */}
        <div className="h-3.5 w-px bg-white/[0.1] mx-0.5 hidden md:block" />

        {/* Center/Left Top Navigation Links in Segmented Pill Bar - hidden on mobile */}
        <nav className="relative flex items-center gap-0.5 bg-[hsl(var(--surface-0))] p-0.5 rounded-lg border border-white/[0.06] text-[11px] font-medium hidden md:flex">
          {[
            {
              id: 'home',
              domId: 'nav-link-home',
              label: 'Home',
              active: mainNav === 'dashboard',
              onClick: () => navigateToMain('dashboard'),
            },
            {
              id: 'studio',
              domId: 'nav-link-studio',
              label: '3D Studio',
              active: mainNav === 'workspace' && activeTool !== 'animation',
              onClick: () => navigateToTool('model'),
            },
            {
              id: 'animation',
              domId: 'nav-link-animation',
              label: 'Animation',
              active: mainNav === 'workspace' && activeTool === 'animation',
              onClick: () => navigateToTool('animation'),
            },
            {
              id: 'assets',
              domId: 'nav-link-assets',
              label: 'Assets',
              active: mainNav === 'assets',
              onClick: () => navigateToMain('assets'),
            },
            {
              id: 'system',
              domId: 'nav-link-system',
              label: 'System',
              active: mainNav === 'system',
              onClick: () => navigateToMain('system'),
            },
          ].map((item) => (
            <button
              key={item.id}
              id={item.domId}
              onClick={item.onClick}
              className={`relative px-2.5 py-1 rounded-md transition-colors cursor-pointer active:scale-95 z-10 ${
                item.active ? 'text-primary font-bold' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {item.active && (
                <motion.div
                  layoutId="topNavActiveIndicator"
                  transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                  className="absolute inset-0 rounded-md bg-[hsl(var(--surface-2))] border border-primary/35 shadow-sm -z-10"
                />
              )}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Right: FastAPI Status Pill, AI Models, DCC Bridge, Settings, Profile */}
      <div className="flex items-center gap-1.5 md:gap-2 flex-shrink-0">
        {/* Restored FastAPI Status Pill - text hidden on small screens */}
        <SimpleTooltip
          label={`FastAPI Backend: ${systemStats.status.toUpperCase()} • GPU: ${systemStats.gpu || 'Auto/CUDA'} • ${systemStats.vramUsedGb != null ? `${systemStats.vramUsedGb}GB VRAM` : 'Ready'}`}
          side="bottom"
        >
          <button
            id="btn-fastapi-status-pill"
            onClick={() => navigateToMain('system')}
            className="cursor-pointer transition-transform active:scale-95"
          >
            <AnimatedStatusBadge
              status={systemStats.status === 'online' ? 'online' : 'offline'}
              label={systemStats.status === 'online' ? 'FastAPI Online' : 'FastAPI Offline'}
            />
          </button>
        </SimpleTooltip>

        {/* AI Models Button - hidden on small mobile */}
        <SimpleTooltip label="Manage AI 3D Models & Weights" side="bottom">
          <button
            id="btn-header-models"
            onClick={() => router.push('/admin?tab=models')}
            className="hidden sm:flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-[hsl(var(--surface-1))] border border-white/[0.08] hover:bg-[hsl(var(--surface-2))] hover:border-white/[0.15] text-[11px] text-zinc-300 transition-all shadow-sm cursor-pointer"
          >
            <Package className="w-3 h-3 text-primary" />
            <span className="font-semibold hidden md:inline">AI Models</span>
          </button>
        </SimpleTooltip>

        {/* DCC Bridge Button - hidden on mobile */}
        <SimpleTooltip label="Connect to Blender / Unreal Engine / Maya via DCC Bridge" side="bottom">
          <button
            id="btn-dcc-bridge"
            onClick={() => setIsDccBridgeOpen(true)}
            className="hidden md:flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-[hsl(var(--surface-1))] border border-white/[0.08] hover:bg-[hsl(var(--surface-2))] hover:border-white/[0.15] text-[11px] text-zinc-300 transition-all shadow-sm cursor-pointer"
          >
            <Cable className="w-3 h-3 text-primary" />
            <span className="font-semibold">DCC Bridge</span>
          </button>
        </SimpleTooltip>

        {/* Quick Settings Icon */}
        <SimpleTooltip label="Quick Settings" side="bottom">
          <button
            id="btn-header-settings"
            onClick={() => setIsSettingsOpen(true)}
            className="w-7 h-7 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-[hsl(var(--surface-1))] transition-colors cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </SimpleTooltip>

        {/* Profile Avatar */}
        <SimpleTooltip label="Admin & Settings" side="bottom">
          <div
            id="btn-header-profile"
            onClick={() => router.push('/admin?tab=settings')}
            className="w-6 h-6 rounded-full bg-[hsl(var(--surface-2))] border border-white/[0.12] flex items-center justify-center text-[10px] font-bold text-primary cursor-pointer hover:border-primary transition-colors overflow-hidden"
          >
            <User className="w-3.5 h-3.5 text-zinc-300" />
          </div>
        </SimpleTooltip>
      </div>
    </header>
  );
};

