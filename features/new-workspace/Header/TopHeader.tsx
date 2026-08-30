import React, { useState } from 'react';
import {
  Box,
  ChevronDown,
  Layers,
  Sliders,
  Bell,
  User,
  Cable,
  Sun,
  Hexagon,
  Globe
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
    <div className="px-3 pt-2.5 pb-1 min-w-320 w-full bg-[#121418]">
      <header
        id="persistent-top-header"
        className="px-3 bg-[#16181f] flex h-11 items-center justify-between overflow-hidden border border-[#252833] rounded-2xl shadow-xl"
      >
        {/* Left Branding & Mode Dropdown */}
        <div className="flex items-center gap-4">
          {/* Brand Studio Logo */}
          <div
            onClick={() => navigateToMain('dashboard')}
            className="flex items-center gap-2 cursor-pointer group p-1"
          >
            <div className="w-5 h-5 rounded-md bg-[#F9CF00] flex items-center justify-center text-black font-black text-[11px] shadow-sm">
              3D
            </div>
            <span className="font-extrabold text-sm tracking-wider text-white uppercase font-mono">
              Studio
            </span>
          </div>

          {/* 3D Workspace Mode Switcher Dropdown */}
          <div className="relative">
            <button
              id="btn-workspace-switcher"
              onClick={() => setWorkspaceMenuOpen(!workspaceMenuOpen)}
              className="group py-1.5 pl-3 pr-2.5 border border-[#2c303d] rounded-xl bg-[#1d2028] flex items-center gap-2 hover:bg-[#252933] transition-colors shadow-sm"
            >
              <span className="text-[#F9CF00] text-xs font-bold flex gap-1.5 items-center">
                <span>3D Workspace</span>
                <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
              </span>
            </button>

            {workspaceMenuOpen && (
              <div className="absolute top-full left-0 mt-2 w-52 py-1.5 rounded-xl bg-[#181b22] border border-[#2c303d] shadow-2xl z-50">
                <button
                  onClick={() => { navigateToTool('model'); setWorkspaceMenuOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-200 hover:bg-[#222630] hover:text-[#F9CF00]"
                >
                  <Box className="w-4 h-4 text-[#F9CF00]" />
                  <span>3D Model Studio</span>
                </button>
                <button
                  onClick={() => { navigateToTool('remesh'); setWorkspaceMenuOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-200 hover:bg-[#222630] hover:text-[#F9CF00]"
                >
                  <Hexagon className="w-4 h-4 text-[#F9CF00]" />
                  <span>Quad Remesh</span>
                </button>
                <button
                  onClick={() => { navigateToTool('worldgen'); setWorkspaceMenuOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-200 hover:bg-[#222630] hover:text-[#F9CF00]"
                >
                  <Globe className="w-4 h-4 text-[#F9CF00]" />
                  <span>World Generation</span>
                </button>
                <button
                  onClick={() => { navigateToTool('texture'); setWorkspaceMenuOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-200 hover:bg-[#222630] hover:text-[#F9CF00]"
                >
                  <Layers className="w-4 h-4 text-[#F9CF00]" />
                  <span>PBR Texture Studio</span>
                </button>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="rounded border border-[#2c303d] bg-[#2c303d] h-3.5 w-px" />

          {/* Top Navigation Links */}
          <nav className="flex items-center gap-2 text-xs font-semibold">
            <button
              id="nav-link-home"
              onClick={() => navigateToMain('dashboard')}
              className={`px-3 py-1 rounded-lg transition-colors ${
                mainNav === 'dashboard'
                  ? 'bg-[#222630] text-[#F9CF00] font-bold border border-[#353a4a]'
                  : 'text-zinc-400 hover:text-white hover:bg-[#1d2028]'
              }`}
            >
              Home
            </button>

            <button
              id="nav-link-assets"
              onClick={() => navigateToMain('assets')}
              className={`px-3 py-1 rounded-lg transition-colors ${
                mainNav === 'assets'
                  ? 'bg-[#222630] text-[#F9CF00] font-bold border border-[#353a4a]'
                  : 'text-zinc-400 hover:text-white hover:bg-[#1d2028]'
              }`}
            >
              Assets
            </button>

            <button
              id="nav-link-system"
              onClick={() => navigateToMain('system')}
              className={`px-3 py-1 rounded-lg transition-colors ${
                mainNav === 'system'
                  ? 'bg-[#222630] text-[#F9CF00] font-bold border border-[#353a4a]'
                  : 'text-zinc-400 hover:text-white hover:bg-[#1d2028]'
              }`}
            >
              System
            </button>
          </nav>
        </div>

        {/* Right DCC Bridge, Status, Notifications, Profile */}
        <div className="flex items-center gap-2.5">
          {/* DCC Bridge Button */}
          <SimpleTooltip label="Connect to Blender / Unreal Engine / Maya via DCC Bridge" side="bottom">
            <button
              id="btn-dcc-bridge"
              onClick={() => setIsDccBridgeOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1d2028] border border-[#2c303d] hover:bg-[#252933] text-xs text-zinc-300 transition-colors"
            >
              <Cable className="w-3.5 h-3.5 text-[#F9CF00]" />
              <span className="font-semibold">DCC Bridge</span>
            </button>
          </SimpleTooltip>

          {/* Live FastAPI Backend Indicator */}
          <button
            id="btn-status-pill"
            onClick={() => setIsSettingsOpen(true)}
            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-xs font-mono transition-all ${
              systemStats.status === 'online'
                ? 'bg-[#181b22] border-emerald-500/40 text-emerald-400'
                : 'bg-[#181b22] border-[#2c303d] text-zinc-400'
            }`}
          >
            <div className={`w-2 h-2 rounded-full ${systemStats.status === 'online' ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse' : 'bg-zinc-600'}`} />
            <span className="text-[11px] font-sans font-medium text-zinc-200">
              FastAPI {systemStats.status === 'online' ? 'Online' : 'Offline'}
            </span>
            {systemStats.status === 'online' && (
              <span className="text-[10px] text-emerald-400 font-mono font-semibold px-1 rounded bg-emerald-500/10">
                {systemStats.vramUsedGb != null ? `${systemStats.vramUsedGb}G` : `${systemStats.lastPingMs}ms`}
              </span>
            )}
          </button>

          {/* Settings Icon */}
          <SimpleTooltip label="Settings">
            <button
              onClick={() => router.push('/settings')}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-[#1d2028] transition-colors"
            >
              <Sun className="w-4 h-4" />
            </button>
          </SimpleTooltip>

          <SimpleTooltip label="Notifications">
            <button
              aria-label="Notifications"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-[#1d2028] transition-colors"
            >
              <Bell className="w-4 h-4" />
            </button>
          </SimpleTooltip>

          {/* Profile Avatar */}
          <div
            onClick={() => router.push('/settings')}
            className="w-7 h-7 rounded-full bg-[#1d2028] border border-[#2c303d] flex items-center justify-center text-xs font-bold text-[#F9CF00] cursor-pointer hover:border-[#F9CF00] transition-colors"
          >
            <User className="w-3.5 h-3.5 text-zinc-300" />
          </div>
        </div>
      </header>
    </div>
  );
};
