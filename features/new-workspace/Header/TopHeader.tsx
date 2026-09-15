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
      className="h-[44px] px-2.5 md:px-4 bg-[#0D0E10]/95 backdrop-blur-md flex items-center justify-between border-b border-white/[0.08] select-none z-50 text-xs w-full flex-shrink-0 min-w-0"
    >
      {/* Left Branding & Mode Dropdown */}
      <div className="flex items-center gap-2.5 md:gap-3.5 min-w-0 overflow-hidden">
        {/* Mobile menu button */}
        <button
          onClick={onMobileMenuToggle}
          className="md:hidden p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-[#191A1D] transition-colors flex-shrink-0 active:scale-95"
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
          <div className="w-5 h-5 rounded-[5px] bg-[#F9CF00] flex items-center justify-center text-black font-black text-[10px] shadow-sm tracking-tighter group-hover:shadow-[0_0_12px_rgba(249,207,0,0.4)] transition-all">
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-black">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <span className="font-extrabold text-xs tracking-wider text-white uppercase font-sans hidden sm:inline group-hover:text-[#F9CF00] transition-colors">
            AI 3D STUDIO
          </span>
        </div>

        {/* 3D Workspace Mode Switcher Dropdown - hidden on mobile */}
        <div ref={workspaceMenuRef} className="relative hidden md:block">
          <button
            id="btn-workspace-switcher"
            onClick={() => setWorkspaceMenuOpen(!workspaceMenuOpen)}
            className="group h-7 px-2.5 rounded-lg bg-[#15161A] border border-white/[0.08] flex items-center gap-1.5 hover:bg-[#1E2025] hover:border-white/[0.14] transition-all active:scale-95 cursor-pointer"
          >
            <span className="text-[#F9CF00] text-[11px] font-bold flex gap-1.5 items-center">
              <span>3D Workspace</span>
              <ChevronDown className={`w-3 h-3 text-zinc-400 group-hover:text-zinc-200 transition-transform duration-200 ${workspaceMenuOpen ? 'rotate-180 text-[#F9CF00]' : ''}`} />
            </span>
          </button>

          {workspaceMenuOpen && (
            <div className="absolute top-full left-0 mt-1.5 w-52 py-1.5 rounded-xl bg-[#16181D]/95 backdrop-blur-xl border border-white/[0.12] shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Workspace Modes
              </div>
              <button
                onClick={() => { navigateToTool('model'); setWorkspaceMenuOpen(false); }}
                className={`w-full flex items-center justify-between px-3 py-1.5 text-[11px] transition-colors cursor-pointer ${
                  mainNav === 'workspace' && activeTool === 'model'
                    ? 'bg-[#22242A] text-[#F9CF00] font-bold'
                    : 'text-zinc-200 hover:bg-[#202126] hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Box className="w-3.5 h-3.5 text-[#F9CF00]" />
                  <span>3D Model Studio</span>
                </div>
                {mainNav === 'workspace' && activeTool === 'model' && <Check className="w-3.5 h-3.5 text-[#F9CF00]" />}
              </button>
              <button
                onClick={() => { navigateToTool('remesh'); setWorkspaceMenuOpen(false); }}
                className={`w-full flex items-center justify-between px-3 py-1.5 text-[11px] transition-colors cursor-pointer ${
                  mainNav === 'workspace' && activeTool === 'remesh'
                    ? 'bg-[#22242A] text-[#F9CF00] font-bold'
                    : 'text-zinc-200 hover:bg-[#202126] hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Hexagon className="w-3.5 h-3.5 text-[#F9CF00]" />
                  <span>Quad Remesh (Poly)</span>
                </div>
                {mainNav === 'workspace' && activeTool === 'remesh' && <Check className="w-3.5 h-3.5 text-[#F9CF00]" />}
              </button>
              <button
                onClick={() => { navigateToTool('texture'); setWorkspaceMenuOpen(false); }}
                className={`w-full flex items-center justify-between px-3 py-1.5 text-[11px] transition-colors cursor-pointer ${
                  mainNav === 'workspace' && activeTool === 'texture'
                    ? 'bg-[#22242A] text-[#F9CF00] font-bold'
                    : 'text-zinc-200 hover:bg-[#202126] hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Layers className="w-3.5 h-3.5 text-[#F9CF00]" />
                  <span>PBR Texture Studio</span>
                </div>
                {mainNav === 'workspace' && activeTool === 'texture' && <Check className="w-3.5 h-3.5 text-[#F9CF00]" />}
              </button>
            </div>
          )}
        </div>

        {/* Divider - hidden on mobile */}
        <div className="h-3.5 w-px bg-white/[0.1] mx-0.5 hidden md:block" />

        {/* Center/Left Top Navigation Links in Segmented Pill Bar - hidden on mobile */}
        <nav className="flex items-center gap-0.5 bg-[#141518] p-0.5 rounded-lg border border-white/[0.06] text-[11px] font-medium hidden md:flex">
          <button
            id="nav-link-home"
            onClick={() => navigateToMain('dashboard')}
            className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
              mainNav === 'dashboard'
                ? 'bg-[#222429] text-white font-bold shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
            }`}
          >
            Home
          </button>

          <button
            id="nav-link-assets"
            onClick={() => navigateToMain('assets')}
            className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
              mainNav === 'assets'
                ? 'bg-[#222429] text-white font-bold shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
            }`}
          >
            Assets
          </button>

          <button
            id="nav-link-system"
            onClick={() => navigateToMain('system')}
            className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
              mainNav === 'system'
                ? 'bg-[#222429] text-white font-bold shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
            }`}
          >
            System
          </button>
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
            className="hidden sm:flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-[#191A1D] border border-white/[0.08] hover:bg-[#25262A] hover:border-white/[0.15] text-[11px] text-zinc-300 transition-all shadow-sm cursor-pointer"
          >
            <Package className="w-3 h-3 text-[#F9CF00]" />
            <span className="font-semibold hidden md:inline">AI Models</span>
          </button>
        </SimpleTooltip>

        {/* DCC Bridge Button - hidden on mobile */}
        <SimpleTooltip label="Connect to Blender / Unreal Engine / Maya via DCC Bridge" side="bottom">
          <button
            id="btn-dcc-bridge"
            onClick={() => setIsDccBridgeOpen(true)}
            className="hidden md:flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-[#191A1D] border border-white/[0.08] hover:bg-[#25262A] hover:border-white/[0.15] text-[11px] text-zinc-300 transition-all shadow-sm cursor-pointer"
          >
            <Cable className="w-3 h-3 text-[#F9CF00]" />
            <span className="font-semibold">DCC Bridge</span>
          </button>
        </SimpleTooltip>

        {/* Quick Settings Icon */}
        <SimpleTooltip label="Quick Settings" side="bottom">
          <button
            id="btn-header-settings"
            onClick={() => setIsSettingsOpen(true)}
            className="w-7 h-7 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-[#191A1D] transition-colors cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </SimpleTooltip>

        {/* Profile Avatar */}
        <SimpleTooltip label="Admin & Settings" side="bottom">
          <div
            id="btn-header-profile"
            onClick={() => router.push('/admin?tab=settings')}
            className="w-6 h-6 rounded-full bg-[#202125] border border-white/[0.12] flex items-center justify-center text-[10px] font-bold text-[#F9CF00] cursor-pointer hover:border-[#F9CF00] transition-colors overflow-hidden"
          >
            <User className="w-3.5 h-3.5 text-zinc-300" />
          </div>
        </SimpleTooltip>
      </div>
    </header>
  );
};

