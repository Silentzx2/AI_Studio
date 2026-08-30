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
  Hexagon
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
      className="h-14 w-full bg-[var(--ws-bg,hsl(var(--surface-0)))] border-b border-[var(--ws-border,hsl(var(--border)))] px-4 flex items-center justify-between z-30 select-none flex-shrink-0"
    >
      {/* Left Branding & Mode Dropdown */}
      <div className="flex items-center gap-6">
        {/* Brand Studio Logo (NEXUS 3D) matching Reference Image */}
        <div
          onClick={() => navigateToMain('dashboard')}
          className="flex items-center gap-2 cursor-pointer group"
        >
          <div className="w-6 h-6 rounded-md bg-[hsl(var(--primary))] flex items-center justify-center shadow-md shadow-[hsl(var(--primary))]/20 group-hover:scale-105 transition-transform">
            <span className="text-[hsl(var(--primary-foreground))] font-black text-xs">▲</span>
          </div>
          <span className="font-extrabold text-sm tracking-wider text-[var(--ws-text,hsl(var(--foreground)))] uppercase font-mono">
            3D Studio
          </span>
        </div>

        {/* 3D Workspace Mode Switcher Dropdown */}
        <div className="relative">
          <button
            id="btn-workspace-switcher"
            onClick={() => setWorkspaceMenuOpen(!workspaceMenuOpen)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[hsl(var(--surface-1))] border border-[var(--ws-border,hsl(var(--border)))] text-xs font-semibold text-[hsl(var(--primary))] hover:border-[hsl(var(--primary))]/50 transition-colors"
          >
            <span>3D Workspace</span>
            <ChevronDown className="w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]" />
          </button>

          {workspaceMenuOpen && (
            <div className="absolute top-full left-0 mt-1.5 w-52 py-1.5 rounded-xl bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] shadow-2xl z-50">
              <button
                onClick={() => { navigateToTool('model'); setWorkspaceMenuOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))]"
              >
                <Box className="w-4 h-4 text-[hsl(var(--primary))]" />
                <span>3D Model Studio</span>
              </button>
              <button
                onClick={() => { navigateToTool('retopo'); setWorkspaceMenuOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))]"
              >
                <Hexagon className="w-4 h-4 text-[hsl(var(--primary))]" />
                <span>Quad Retopology</span>
              </button>
              <button
                onClick={() => { navigateToTool('texture'); setWorkspaceMenuOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))]"
              >
                <Layers className="w-4 h-4 text-[hsl(var(--primary))]" />
                <span>PBR Texture Studio</span>
              </button>
              <button
                onClick={() => { navigateToTool('segment'); setWorkspaceMenuOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))]"
              >
                <Sliders className="w-4 h-4 text-[hsl(var(--primary))]" />
                <span>Segmentation</span>
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
                ? 'text-[hsl(var(--primary))] font-bold'
                : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
            }`}
          >
            Home
          </button>

          <button
            id="nav-link-assets"
            onClick={() => navigateToMain('assets')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              mainNav === 'assets'
                ? 'text-[hsl(var(--primary))] font-bold'
                : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
            }`}
          >
            Assets
          </button>

          <button
            id="nav-link-system"
            onClick={() => navigateToMain('system')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${mainNav === 'system' ? 'text-[hsl(var(--primary))] font-bold' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}`}
          >
            System
          </button>
        </nav>
      </div>

        {/* Right DCC Bridge, FastAPI 3D Status, Notifications, Profile (Personal Use - No Billing/Credits) */}
        <div className="flex items-center gap-3.5">
          {/* DCC Bridge Button with Version (Reference Image) */}
          <SimpleTooltip label="Connect to Blender / Unreal Engine / Maya via DCC Bridge">
            <button
              id="btn-dcc-bridge"
              onClick={() => setIsDccBridgeOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[hsl(var(--surface-1))] border border-[var(--ws-border,hsl(var(--border)))] hover:border-[hsl(var(--border))] text-xs text-[hsl(var(--foreground))] transition-colors"
            >
              <Cable className="w-3.5 h-3.5 text-[hsl(var(--primary))]" />
              <span className="font-medium">DCC Bridge</span>
            </button>
          </SimpleTooltip>

          {/* Live FastAPI Backend Indicator */}
          <button
            id="btn-status-pill"
            onClick={() => setIsSettingsOpen(true)}
            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-mono transition-all ${
              systemStats.status === 'online'
                ? 'bg-[hsl(var(--status-online))]/10 border-[hsl(var(--status-online))]/40 text-[hsl(var(--status-online))] hover:border-[hsl(var(--status-online))]'
                : 'bg-[hsl(var(--destructive))]/10 border-[hsl(var(--destructive))]/40 text-[hsl(var(--destructive))] hover:border-[hsl(var(--destructive))]'
            }`}
          >
          <div className={`w-2 h-2 rounded-full ${systemStats.status === 'online' ? 'bg-[hsl(var(--status-online))] shadow-[0_0_8px_hsl(var(--status-online))] animate-pulse' : 'bg-[hsl(var(--destructive))]'}`} />
          <span className="text-[11px] font-sans font-medium text-[hsl(var(--foreground))]">
            FastAPI {systemStats.status === 'online' ? '8000' : 'Offline'}
          </span>
          {systemStats.status === 'online' && (
            <span className="text-[10px] text-[hsl(var(--status-online))] font-mono font-semibold px-1 rounded bg-[hsl(var(--status-online))]/10">
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
          className="w-7 h-7 rounded-full bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] flex items-center justify-center text-xs font-bold text-[hsl(var(--primary))] cursor-pointer hover:border-[hsl(var(--primary))] transition-colors"
        >
          <User className="w-4 h-4 text-[hsl(var(--foreground))]" />
        </div>
      </div>
    </header>
  );
};
