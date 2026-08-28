import React, { useState } from 'react';
import {
  Box,
  ChevronDown,
  Layers,
  Sliders,
  Activity,
  Bell,
  User,
  Cable,
  Sun,
  Hexagon,
  Image as ImageIcon
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useWorkspace } from '../store/WorkspaceContext';

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
      className="h-14 w-full bg-[#0d0e12] border-b border-[#21242c] px-4 flex items-center justify-between z-30 select-none flex-shrink-0"
    >
      {/* Left Branding & Mode Dropdown */}
      <div className="flex items-center gap-6">
        {/* Brand Studio Logo (NEXUS 3D) matching Reference Image */}
        <div 
          onClick={() => navigateToMain('dashboard')}
          className="flex items-center gap-2 cursor-pointer group"
        >
          <div className="w-6 h-6 rounded-md bg-[#f5c518] flex items-center justify-center shadow-md shadow-[#f5c518]/20 group-hover:scale-105 transition-transform">
            <span className="text-[#111216] font-black text-xs">▲</span>
          </div>
          <span className="font-extrabold text-sm tracking-wider text-[#f3f4f6] uppercase font-mono">
            NEXUS 3D
          </span>
        </div>

        {/* 3D Workspace Mode Switcher Dropdown */}
        <div className="relative">
          <button
            id="btn-workspace-switcher"
            onClick={() => setWorkspaceMenuOpen(!workspaceMenuOpen)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#16181f] border border-[#272b36] text-xs font-semibold text-[#f5c518] hover:border-[#f5c518]/50 transition-colors"
          >
            <span>3D Workspace</span>
            <ChevronDown className="w-3.5 h-3.5 text-[#9ca3af]" />
          </button>

          {workspaceMenuOpen && (
            <div className="absolute top-full left-0 mt-1.5 w-52 py-1.5 rounded-xl bg-[#181a20] border border-[#303542] shadow-2xl z-50">
              <button
                onClick={() => { navigateToTool('model'); setWorkspaceMenuOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-[#e5e7eb] hover:bg-[#232731]"
              >
                <Box className="w-4 h-4 text-[#f5c518]" />
                <span>3D Model Studio</span>
              </button>
              <button
                onClick={() => { navigateToTool('retopo'); setWorkspaceMenuOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-[#e5e7eb] hover:bg-[#232731]"
              >
                <Hexagon className="w-4 h-4 text-[#f5c518]" />
                <span>Quad Retopology</span>
              </button>
              <button
                onClick={() => { navigateToTool('texture'); setWorkspaceMenuOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-[#e5e7eb] hover:bg-[#232731]"
              >
                <Layers className="w-4 h-4 text-[#f5c518]" />
                <span>PBR Texture Studio</span>
              </button>
              <button
                onClick={() => { navigateToTool('segment'); setWorkspaceMenuOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-[#e5e7eb] hover:bg-[#232731]"
              >
                <Sliders className="w-4 h-4 text-[#f5c518]" />
                <span>Segmentation</span>
              </button>
              <button
                onClick={() => { navigateToTool('rigging'); setWorkspaceMenuOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-[#e5e7eb] hover:bg-[#232731]"
              >
                <Hexagon className="w-4 h-4 text-[#f5c518]" />
                <span>Rigging</span>
              </button>
            </div>
          )}
        </div>

        {/* Top Navigation Links */}
        <nav className="flex items-center gap-2 text-xs font-medium">
          <button
            id="nav-link-home"
            onClick={() => navigateToMain('dashboard')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              mainNav === 'dashboard'
                ? 'text-[#f5c518] font-bold'
                : 'text-[#9ca3af] hover:text-[#f3f4f6]'
            }`}
          >
            Home
          </button>

          <button
            id="nav-link-assets"
            onClick={() => navigateToMain('assets')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              mainNav === 'assets'
                ? 'text-[#f5c518] font-bold'
                : 'text-[#9ca3af] hover:text-[#f3f4f6]'
            }`}
          >
            Assets
          </button>

          <button
            id="nav-link-system"
            onClick={() => navigateToMain('system')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${mainNav === 'system' ? 'text-[#f5c518] font-bold' : 'text-[#9ca3af] hover:text-[#f3f4f6]'}`}
          >
            System
          </button>
        </nav>
      </div>

      {/* Right DCC Bridge, FastAPI 3D Status, Notifications, Profile (Personal Use - No Billing/Credits) */}
      <div className="flex items-center gap-3.5">
        {/* DCC Bridge Button with Version (Reference Image) */}
        <button
          id="btn-dcc-bridge"
          onClick={() => setIsDccBridgeOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#16181f] border border-[#272b36] hover:border-[#3b4150] text-xs text-[#cbd5e1] transition-colors"
          title="Connect to Blender / Unreal Engine / Maya via DCC Bridge"
        >
          <Cable className="w-3.5 h-3.5 text-[#f5c518]" />
          <span className="font-medium">DCC Bridge</span>
                  </button>

        {/* Live FastAPI Backend Indicator */}
        <button
          id="btn-status-pill"
          onClick={() => setIsSettingsOpen(true)}
          className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-mono transition-all ${
            systemStats.status === 'online'
              ? 'bg-[#121b18] border-[#22c55e]/40 text-[#86efac] hover:border-[#22c55e]'
              : 'bg-[#1e1616] border-[#ef4444]/40 text-[#fca5a5] hover:border-[#ef4444]'
          }`}
          title={
            systemStats.status === 'online'
              ? `FastAPI Backend Connected: localhost:8000 (${systemStats.lastPingMs}ms) • ${systemStats.gpu || 'GPU'}${systemStats.vramUsedGb != null ? ` • VRAM ${systemStats.vramUsedGb}GB / ${systemStats.vramTotalGb || '?'}GB` : ''}`
              : 'FastAPI Backend Offline at localhost:8000 • Click to open settings'
          }
        >
          <div className={`w-2 h-2 rounded-full ${systemStats.status === 'online' ? 'bg-[#22c55e] shadow-[0_0_8px_#22c55e] animate-pulse' : 'bg-[#ef4444]'}`} />
          <span className="text-[11px] font-sans font-medium text-[#e2e8f0]">
            FastAPI {systemStats.status === 'online' ? '8000' : 'Offline'}
          </span>
          {systemStats.status === 'online' && (
            <span className="text-[10px] text-[#4ade80] font-mono font-semibold px-1 rounded bg-[#22c55e]/10">
              {systemStats.vramUsedGb != null ? `${systemStats.vramUsedGb}G` : `${systemStats.lastPingMs}ms`}
            </span>
          )}
        </button>

        {/* Brightness / Theme Icon */}
        <button
          onClick={() => router.push('/settings')}
          className="p-1.5 rounded-lg text-[#9ca3af] hover:text-[#f3f4f6] hover:bg-[#1c1e24] transition-colors"
          title="Settings"
        >
          <Sun className="w-4 h-4" />
        </button>

        <button
          aria-label="Notifications"
          className="p-1.5 rounded-lg text-[#9ca3af] hover:text-[#f3f4f6] hover:bg-[#1c1e24] transition-colors"
          title="Notifications"
        >
          <Bell className="w-4 h-4" />
        </button>

        {/* Profile Avatar */}
        <div
          onClick={() => router.push('/settings')}
          className="w-7 h-7 rounded-full bg-[#242732] border border-[#3c4252] flex items-center justify-center text-xs font-bold text-[#f5c518] cursor-pointer hover:border-[#f5c518] transition-colors"
        >
          <User className="w-4 h-4 text-[#cbd5e1]" />
        </div>
      </div>
    </header>
  );
};
