import React, { useState } from 'react';
import {
  Box,
  ChevronDown,
  Layers,
  Bell,
  User,
  Cable,
  Hexagon,
  Globe,
  Zap,
  Package,
  Settings,
  Sparkles
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useWorkspace } from '../store/WorkspaceContext';
import { SimpleTooltip } from '@/components/ui/simple-tooltip';

export const TopHeader: React.FC = () => {
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

  return (
    <header
      id="persistent-top-header"
      className="h-[42px] px-3 bg-[#0D0E10] flex items-center justify-between border-b border-white/[0.08] select-none z-50 text-xs w-full flex-shrink-0"
    >
      {/* Left Branding & Mode Dropdown */}
      <div className="flex items-center gap-3">
        {/* Brand Studio Logo (AI 3D Studio) */}
        <div
          onClick={() => navigateToMain('dashboard')}
          className="flex items-center gap-2 cursor-pointer group p-1"
        >
          {/* Stylized Logo Cube */}
          <div className="w-5 h-5 rounded-[5px] bg-[#F9CF00] flex items-center justify-center text-black font-black text-[10px] shadow-sm tracking-tighter">
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-black">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <span className="font-extrabold text-xs tracking-wider text-white uppercase font-sans">
            AI 3D STUDIO
          </span>
        </div>

        {/* 3D Workspace Mode Switcher Dropdown */}
        <div className="relative">
          <button
            id="btn-workspace-switcher"
            onClick={() => setWorkspaceMenuOpen(!workspaceMenuOpen)}
            className="group h-7 px-2.5 rounded-lg bg-[#191A1D] border border-white/[0.08] flex items-center gap-1.5 hover:bg-[#22242A] hover:border-white/[0.14] transition-all"
          >
            <span className="text-[#F9CF00] text-[11px] font-bold flex gap-1 items-center">
              <span>3D Workspace</span>
              <ChevronDown className="w-3 h-3 text-zinc-400 group-hover:text-zinc-200 transition-colors" />
            </span>
          </button>

          {workspaceMenuOpen && (
            <div className="absolute top-full left-0 mt-1 w-48 py-1 rounded-xl bg-[#191A1D] border border-white/[0.12] shadow-2xl z-50">
              <button
                onClick={() => { navigateToTool('model'); setWorkspaceMenuOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-zinc-200 hover:bg-[#25262A] hover:text-[#F9CF00] transition-colors"
              >
                <Box className="w-3.5 h-3.5 text-[#F9CF00]" />
                <span>3D Model Studio</span>
              </button>
              <button
                onClick={() => { navigateToTool('remesh'); setWorkspaceMenuOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-zinc-200 hover:bg-[#25262A] hover:text-[#F9CF00] transition-colors"
              >
                <Hexagon className="w-3.5 h-3.5 text-[#F9CF00]" />
                <span>Quad Remesh (Poly)</span>
              </button>
              <button
                onClick={() => { navigateToTool('worldgen'); setWorkspaceMenuOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-zinc-200 hover:bg-[#25262A] hover:text-[#F9CF00] transition-colors"
              >
                <Globe className="w-3.5 h-3.5 text-[#F9CF00]" />
                <span>World Generation</span>
              </button>
              <button
                onClick={() => { navigateToTool('texture'); setWorkspaceMenuOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-zinc-200 hover:bg-[#25262A] hover:text-[#F9CF00] transition-colors"
              >
                <Layers className="w-3.5 h-3.5 text-[#F9CF00]" />
                <span>PBR Texture Studio</span>
              </button>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="h-3.5 w-px bg-white/[0.1] mx-0.5" />

        {/* Center/Left Top Navigation Links */}
        <nav className="flex items-center gap-1 text-[11px] font-medium">
          <button
            id="nav-link-home"
            onClick={() => navigateToMain('dashboard')}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              mainNav === 'dashboard'
                ? 'text-white font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Home
          </button>

          <button
            id="nav-link-assets"
            onClick={() => navigateToMain('assets')}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              mainNav === 'assets'
                ? 'text-white font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Assets
          </button>

          <button
            id="nav-link-system"
            onClick={() => navigateToMain('system')}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              mainNav === 'system'
                ? 'text-white font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            System
          </button>
        </nav>
      </div>

      {/* Right: FastAPI Status Pill, AI Models, DCC Bridge, Settings, Profile */}
      <div className="flex items-center gap-2">
        {/* Restored FastAPI Status Pill */}
        <SimpleTooltip 
          label={`FastAPI Backend: ${systemStats.status.toUpperCase()} • GPU: ${systemStats.gpu || 'Auto/CUDA'} • ${systemStats.vramUsedGb != null ? `${systemStats.vramUsedGb}GB VRAM` : 'Ready'}`} 
          side="bottom"
        >
          <button
            id="btn-fastapi-status-pill"
            onClick={() => navigateToMain('system')}
            className="flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-[#191A1D] border border-white/[0.08] hover:bg-[#25262A] hover:border-white/[0.16] text-[11px] text-zinc-300 transition-all shadow-sm cursor-pointer"
          >
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${systemStats.status === 'online' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
              <span className={`relative inline-flex rounded-full h-2 w-2 ${systemStats.status === 'online' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            </span>
            <span className="font-bold text-white tracking-wide">FastAPI</span>
            <span className="text-zinc-500 text-[10px] uppercase font-mono">
              {systemStats.status === 'online' ? 'Online' : 'Offline'}
            </span>
          </button>
        </SimpleTooltip>

        {/* AI Models Button */}
        <SimpleTooltip label="Manage AI 3D Models & Weights" side="bottom">
          <button
            id="btn-header-models"
            onClick={() => router.push('/settings?section=models')}
            className="flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-[#191A1D] border border-white/[0.08] hover:bg-[#25262A] hover:border-white/[0.15] text-[11px] text-zinc-300 transition-all shadow-sm cursor-pointer"
          >
            <Package className="w-3 h-3 text-[#F9CF00]" />
            <span className="font-semibold">AI Models</span>
          </button>
        </SimpleTooltip>

        {/* DCC Bridge Button */}
        <SimpleTooltip label="Connect to Blender / Unreal Engine / Maya via DCC Bridge" side="bottom">
          <button
            id="btn-dcc-bridge"
            onClick={() => setIsDccBridgeOpen(true)}
            className="flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-[#191A1D] border border-white/[0.08] hover:bg-[#25262A] hover:border-white/[0.15] text-[11px] text-zinc-300 transition-all shadow-sm cursor-pointer"
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
        <SimpleTooltip label="User & Backend Settings" side="bottom">
          <div
            id="btn-header-profile"
            onClick={() => router.push('/settings')}
            className="w-6 h-6 rounded-full bg-[#202125] border border-white/[0.12] flex items-center justify-center text-[10px] font-bold text-[#F9CF00] cursor-pointer hover:border-[#F9CF00] transition-colors overflow-hidden"
          >
            <User className="w-3.5 h-3.5 text-zinc-300" />
          </div>
        </SimpleTooltip>
      </div>
    </header>
  );
};

