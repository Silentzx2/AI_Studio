"use client";


import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Bell, Menu, X, Box, Cpu, Wifi, Zap, ChevronDown,
  PanelLeft, PanelRight, LayoutDashboard, Boxes, Package, Activity
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { APP_NAME } from '@/constants';
import { StatusDot } from '@/components/premium/StatusDot';
import { runtimeService } from '@/services/runtimeService';
import { useUIStore } from '@/stores/useUIStore';
import { useBackendStatus } from '@/hooks/useBackendData';
import type { BackendStatus } from '@/hooks/useBackendData';
import type { RuntimeStatus } from '@/types';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';

const NAV_LINKS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/workspace', label: 'Workspace', icon: Box },
  // ponytail: Changed /models to /settings?section=models - unified model management
  { href: '/settings?section=models', label: 'Models', icon: Boxes },
  { href: '/settings', label: 'Settings', icon: Package },
];

export function WorkspaceNavbar() {
  const pathname = usePathname();
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const { setMobileLeftSidebarOpen, setMobileRightSidebarOpen, creativeLayoutMode, toggleCreativeLayoutMode } = useUIStore();

  useEffect(() => {
    const tick = async () => {
      try {
        const status = await runtimeService.getStatus();
        if (status) setRuntime(status);
      } catch { /* silently ignore */ }
    };
    tick();
    const interval = setInterval(tick, 10000);
    return () => clearInterval(interval);
  }, []);

 const gpuStatus: boolean | null = runtime ? (runtime.cuda_available as boolean) : null;
 const backendStatus: BackendStatus = useBackendStatus();
  const vramUsed = runtime ? (runtime.vram_used_mb / 1024).toFixed(1) : '—';
  const vramTotal = runtime ? (runtime.vram_total_mb / 1024).toFixed(0) : '—';

  return (
    <header className="glass-frosted shrink-0 z-30 relative" style={{ boxShadow: '0 1px 0 0 hsl(var(--neon-purple) / 0.08), 0 4px 20px hsl(var(--surface-0) / 0.3)' }}>
      {/* Bottom gradient divider line with glow */}
      <div className="divider-gradient" style={{ boxShadow: '0 0 8px hsl(var(--neon-purple) / 0.15)' }} />

      <div className="flex items-center justify-between h-12 px-3 sm:px-4 lg:px-5">
        <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
          {/* Mobile left sidebar toggle */}
          <button
            onClick={() => setMobileLeftSidebarOpen(true)}
            className="lg:hidden p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all duration-200 touch-target"
          >
            <PanelLeft className="w-4 h-4" />
          </button>

          {/* Logo */}
          <div className="flex items-center gap-2 shrink-0 group">
            <div
              className={cn(
                'flex items-center justify-center w-7 h-7 rounded-lg',
                'bg-gradient-to-br from-[hsl(var(--neon-purple)/0.2)] to-[hsl(var(--neon-blue)/0.2)]',
                'border border-[hsl(var(--neon-purple)/0.3)]',
                'transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
                'group-hover:shadow-neon'
              )}
            >
              <Box className="w-4 h-4 text-[hsl(var(--neon-purple))] transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] group-hover:scale-110" style={{ animation: 'pulse-glow 3s ease-in-out infinite' }} />
            </div>
            <span className="text-sm font-bold tracking-tight hidden sm:block text-gradient">{APP_NAME}</span>
          </div>

          {/* Nav Links */}
          <div className="hidden md:flex items-center gap-0.5 ml-3">
            {NAV_LINKS.map((link) => {
              const Icon = link.icon;
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.label}
                  href={link.href}
                  className={cn(
                    'relative flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]',
                    isActive
                      ? 'tab-premium-active shadow-[0_0_12px_hsl(var(--neon-purple)/0.15)]'
                      : 'tab-premium hover:shadow-[0_0_8px_hsl(var(--neon-purple)/0.08)]'
                  )}
                >
                  {isActive && (
                    <motion.div
                      layoutId="nav-active-indicator"
                      className="absolute -bottom-0 left-2 right-2 h-[1.5px] rounded-full"
                      style={{ background: 'linear-gradient(90deg, hsl(var(--neon-purple)), hsl(var(--neon-blue)))' }}
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <Icon className={cn('w-3.5 h-3.5 transition-all duration-200', isActive ? 'drop-shadow-[0_0_4px_hsl(var(--neon-purple)/0.6)]' : 'group-hover:drop-shadow-[0_0_3px_hsl(var(--neon-purple)/0.3)]')} />
                  {link.label}
                </Link>
              );
            })}
          </div>

          {/* Search */}
          <div className="relative flex-1 max-w-sm hidden md:block ml-3">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search commands..."
              className="input-premium w-full h-8 pl-8 pr-14 text-xs text-foreground"
              readOnly
              onClick={() => {
                // Trigger Cmd+K / Ctrl+K to open the command palette
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, ctrlKey: true, bubbles: true }));
              }}
            />
            <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none chip text-[10px] font-mono leading-none px-1.5 py-0.5 text-muted-foreground">
              ⌘K
            </kbd>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* GPU Status */}
          <div className="hidden md:flex items-center gap-1.5 px-2 py-1 rounded-lg glass-card transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] hover:border-[hsl(var(--border)/0.6)] hover:shadow-[0_0_12px_hsl(var(--neon-cyan)/0.08)]">
            <Cpu className="w-3 h-3 text-[hsl(var(--neon-cyan))]" style={{ filter: 'drop-shadow(0 0 6px hsl(var(--neon-cyan) / 0.6))' }} />
            <span className="text-[10px] font-medium text-muted-foreground">GPU</span>
            <StatusDot status={gpuStatus === true ? 'online' : gpuStatus === false ? 'offline' : 'loading'} size="sm" />
          </div>

          {/* Backend Status */}
          <div className="hidden md:flex items-center gap-1.5 px-2 py-1 rounded-lg glass-card transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] hover:border-[hsl(var(--border)/0.6)] hover:shadow-[0_0_12px_hsl(var(--neon-green)/0.08)]">
           <Wifi
  className={`w-3 h-3 ${backendStatus === 'online' ? 'text-[hsl(var(--neon-green))]' : backendStatus === 'offline' ? 'text-[hsl(var(--destructive))]' : 'text-[hsl(var(--neon-amber))]'}`}
  style={{ filter: backendStatus === 'online' ? 'drop-shadow(0 0 6px hsl(142 76% 46% / 0.6))' : 'none' }}
/>
<span className="text-[10px] font-medium text-muted-foreground">
  {backendStatus === 'unknown' ? 'Connecting' : 'Backend'}
</span>
<StatusDot status={backendStatus === 'online' ? 'online' : backendStatus === 'offline' ? 'offline' : 'loading'} size="sm" />
          </div>

          {/* System Status */}
          <HoverCard>
            <HoverCardTrigger asChild>
              <div className="hidden lg:flex items-center gap-1.5 px-2 py-1 rounded-lg glass-card transition-all duration-200 hover:border-[hsl(var(--border)/0.6)] cursor-pointer hover:shadow-[0_0_12px_hsl(var(--neon-blue)/0.15)]">
                <Activity className="w-3.5 h-3.5 text-[hsl(var(--neon-blue))] animate-pulse" style={{ filter: 'drop-shadow(0 0 6px hsl(217 91% 60% / 0.6))' }} />
              </div>
            </HoverCardTrigger>
            <HoverCardContent className="w-56 z-50 p-3 border border-border bg-background shadow-lg shadow-black/20" align="end" sideOffset={12}>
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider text-muted-foreground">System Status</h4>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">CPU Usage</span>
                    <span className="font-mono font-medium">{runtime ? runtime.cpu_usage.toFixed(1) : '—'}%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">GPU Usage</span>
                    <span className="font-mono font-medium">{runtime ? runtime.gpu_utilization.toFixed(1) : '—'}%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Memory</span>
                    <span className="font-mono font-medium">{runtime ? (runtime.ram_usage / 1024).toFixed(1) : '—'} / {runtime ? (runtime.ram_total / 1024).toFixed(1) : '—'} GB</span>
                  </div>
                </div>
              </div>
            </HoverCardContent>
          </HoverCard>

          {/* VRAM */}
          <div className="hidden lg:flex items-center gap-1.5 px-2 py-1 rounded-lg glass-card transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] hover:border-[hsl(var(--border)/0.6)] hover:shadow-[0_0_12px_hsl(var(--neon-amber)/0.08)]">
            <Zap className="w-3 h-3 text-[hsl(var(--neon-amber))]" style={{ filter: 'drop-shadow(0 0 6px hsl(38 92% 50% / 0.6))' }} />
            <span className="text-[10px] font-mono text-muted-foreground">{vramUsed}/{vramTotal} GB</span>
          </div>

          {/* Notifications */}
          <button className="relative p-1.5 rounded-lg glass-card text-muted-foreground hover:text-foreground transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] hover:border-[hsl(var(--neon-purple)/0.2)] hover:shadow-[0_0_12px_hsl(var(--neon-pink)/0.1)] touch-target">
            <Bell className="w-3.5 h-3.5 transition-all duration-200" />
            <span
              className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[hsl(var(--neon-pink))]"
              style={{
                boxShadow: '0 0 6px hsl(var(--neon-pink) / 0.6)',
                animation: 'pulse-glow 2s ease-in-out infinite',
              }}
            />
          </button>

          {/* User Avatar */}
          <div className="flex items-center gap-1.5 p-0.5 pl-0.5 pr-2 rounded-lg glass-card transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] hover:border-[hsl(var(--border)/0.6)]">
            <div
              className="w-6 h-6 rounded-md bg-gradient-to-br from-[hsl(var(--neon-purple))] to-[hsl(var(--neon-blue))] flex items-center justify-center text-[10px] font-bold text-white"
              style={{
                boxShadow: '0 0 0 1.5px hsl(var(--surface-1)), 0 0 0 2.5px hsl(var(--neon-purple) / 0.4), 0 0 0 3.5px hsl(var(--neon-blue) / 0.3)',
              }}
            >
              AI
            </div>
            <ChevronDown className="hidden sm:block w-3 h-3 text-muted-foreground" />
          </div>

          {/* Mobile right sidebar toggle */}
          <button
            onClick={() => setMobileRightSidebarOpen(true)}
            className="lg:hidden p-1.5 rounded-lg glass-card text-muted-foreground hover:text-foreground transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] hover:border-[hsl(var(--border)/0.6)] touch-target"
          >
            <PanelRight className="w-4 h-4" />
          </button>

          {/* Mobile menu */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all duration-200 touch-target"
          >
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scaleY: 0.95 }}
            animate={{ opacity: 1, y: 0, scaleY: 1 }}
            exit={{ opacity: 0, y: -8, scaleY: 0.95 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="absolute top-12 left-0 right-0 glass-ultra p-3 lg:hidden z-50 shadow-premium-lg"
          >
            <div className="relative mb-3">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className="input-premium w-full h-8 pl-8 pr-3 text-xs"
              />
            </div>
            <div className="space-y-1">
              {NAV_LINKS.map((link) => {
                const Icon = link.icon;
              const isActive = pathname === link.href || (link.href.includes('?') && pathname === link.href.split('?')[0]);
                return (
                  <Link
                    key={link.label}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      'flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]',
                      isActive
                        ? 'tab-premium-active text-foreground'
                        : 'text-foreground hover:bg-white/5 hover:text-foreground'
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {link.label}
                  </Link>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}