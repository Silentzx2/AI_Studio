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
    <div className="px-3 pt-3 pb-1.5 min-w-320 w-full">
<header
          id="persistent-top-header"
          className="px-2 bg-[hsl(var(--surface-0))] flex h-12 items-center justify-between overflow-hidden border-b border-[hsl(var(--border))]"
          style={{ borderRadius: '1.5625rem' }}
        >
        {/* Left Branding & Mode Dropdown */}
        <div className="flex items-center gap-4">
          {/* Brand Studio Logo */}
          <div
            onClick={() => navigateToMain('dashboard')}
            className="flex items-center gap-1.5 cursor-pointer group p-1.5"
          >
            <div className="i-tripo:tripo v-mid size-5 text-[#F9CF00]" />
            <span className="font-extrabold text-sm tracking-wider text-[hsl(var(--foreground))] uppercase font-mono">
              3D Studio
            </span>
          </div>

          {/* 3D Workspace Mode Switcher Dropdown */}
          <div className="relative">
<button
                id="btn-workspace-switcher"
                onClick={() => setWorkspaceMenuOpen(!workspaceMenuOpen)}
                className="group gradient-border-header ml-3 py-2 pl-4 pr-3 border-1 border-[hsl(var(--border))] rounded-10 bg-[hsl(var(--surface-1))] flex shadow-header-float relative hover:bg-[hsl(var(--surface-2))] transition-colors"
              >
              <span className="text-3.5 c-[#F9CF00] font-500 flex gap-2 items-center text-xs font-semibold">
                <span>3D Workspace</span>
                <ChevronDown className="w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]" />
              </span>
            </button>

            {workspaceMenuOpen && (
              <div className="absolute top-full left-0 mt-1.5 w-52 py-1.5 rounded-xl bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] shadow-2xl z-50">
                <button
                  onClick={() => { navigateToTool('model'); setWorkspaceMenuOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))]"
                >
                  <Box className="w-4 h-4 text-[#F9CF00]" />
                  <span>3D Model Studio</span>
                </button>
                <button
                  onClick={() => { navigateToTool('remesh'); setWorkspaceMenuOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))]"
                >
                  <Hexagon className="w-4 h-4 text-[#F9CF00]" />
                  <span>Quad Remesh</span>
                </button>
                <button
                  onClick={() => { navigateToTool('worldgen'); setWorkspaceMenuOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))]"
                >
                  <Globe className="w-4 h-4 text-[#F9CF00]" />
                  <span>World Generation</span>
                </button>
                <button
                  onClick={() => { navigateToTool('texture'); setWorkspaceMenuOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))]"
                >
                  <Layers className="w-4 h-4 text-[#F9CF00]" />
                  <span>PBR Texture Studio</span>
                </button>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="mx-3 rounded-1 border border-[hsl(var(--border))] bg-[hsl(var(--border))] h-3 w-px" />

          {/* Top Navigation Links */}
          <nav className="flex items-center gap-6 text-xs font-medium" data-v-ae20af76="">
            <button
              id="nav-link-home"
              onClick={() => navigateToMain('dashboard')}
              className={`px-3 rounded-full flex h-7.5 whitespace-nowrap items-center justify-center transition-colors ${
                mainNav === 'dashboard'
                  ? 'text-[#F9CF00] font-bold'
                  : 'text-[#f2f2f2] hover:bg-[hsl(var(--surface-2))]'
              }`}
            >
              Home
            </button>

            <button
              id="nav-link-assets"
              onClick={() => navigateToMain('assets')}
              className={`px-3 rounded-full flex h-7.5 whitespace-nowrap items-center justify-center transition-colors ${
                mainNav === 'assets'
                  ? 'text-[#F9CF00] font-bold'
                  : 'text-[#f2f2f2] hover:bg-[hsl(var(--surface-2))]'
              }`}
            >
              Assets
            </button>

            <button
              id="nav-link-system"
              onClick={() => navigateToMain('system')}
              className={`px-3 rounded-full flex h-7.5 whitespace-nowrap items-center justify-center transition-colors ${
                mainNav === 'system'
                  ? 'text-[#F9CF00] font-bold'
                  : 'text-[#f2f2f2] hover:bg-[hsl(var(--surface-2))]'
              }`}
            >
              System
            </button>
          </nav>
        </div>

        {/* Right DCC Bridge, Status, Notifications, Profile */}
        <div className="flex items-center gap-3">
          {/* DCC Bridge Button */}
          <SimpleTooltip label="Connect to Blender / Unreal Engine / Maya via DCC Bridge" side="bottom">
<button
               id="btn-dcc-bridge"
               onClick={() => setIsDccBridgeOpen(true)}
               className="flex items-center gap-1.5 px-3 py-1.5 rounded-10 bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] hover:bg-[hsl(var(--surface-2))] text-xs text-[hsl(var(--foreground))] transition-colors"
             >
              <Cable className="w-3.5 h-3.5 text-[#F9CF00]" />
              <span className="font-medium">DCC Bridge</span>
            </button>
          </SimpleTooltip>

          {/* Live FastAPI Backend Indicator */}
          <button
            id="btn-status-pill"
            onClick={() => setIsSettingsOpen(true)}
            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-mono transition-all ${
              systemStats.status === 'online'
                ? 'bg-[hsl(var(--surface-1))] border-[hsl(var(--status-online))] text-[hsl(var(--status-online))] hover:border-[hsl(var(--status-online))]'
                : 'bg-[hsl(var(--surface-1))] border-[hsl(var(--destructive))] text-[hsl(var(--destructive))] hover:border-[hsl(var(--destructive))]'
            }`}
          >
            <div className={`w-2 h-2 rounded-full ${systemStats.status === 'online' ? 'bg-[hsl(var(--status-online))] shadow-[0_0_8px_hsl(var(--status-online))] animate-pulse' : 'bg-[hsl(var(--destructive))]'}`} />
            <span className="text-[11px] font-sans font-medium text-[hsl(var(--foreground))]">
              FastAPI {systemStats.status === 'online' ? '8000' : 'Offline'}
            </span>
            {systemStats.status === 'online' && (
              <span className="text-[10px] text-[hsl(var(--status-online))] font-mono font-semibold px-1 rounded bg-[hsl(var(--surface-2))]">
                {systemStats.vramUsedGb != null ? `${systemStats.vramUsedGb}G` : `${systemStats.lastPingMs}ms`}
              </span>
            )}
          </button>

          {/* Brightness / Theme Icon */}
          <SimpleTooltip label="Settings">
            <button
              onClick={() => router.push('/settings')}
              className="p-1.5 rounded-lg text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))] transition-colors"
            >
              <Sun className="w-4 h-4" />
            </button>
          </SimpleTooltip>

          <SimpleTooltip label="Notifications">
            <button
              aria-label="Notifications"
              className="p-1.5 rounded-lg text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))] transition-colors"
            >
              <Bell className="w-4 h-4" />
            </button>
          </SimpleTooltip>

          {/* Profile Avatar */}
          <div
            onClick={() => router.push('/settings')}
            className="w-7 h-7 rounded-full bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] flex items-center justify-center text-xs font-bold text-[#F9CF00] cursor-pointer hover:border-[#F9CF00] transition-colors"
          >
            <User className="w-4 h-4 text-[hsl(var(--foreground))]" />
          </div>
        </div>
      </header>
    </div>
  );
};
