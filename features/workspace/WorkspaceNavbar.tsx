"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  Search, Menu, X, Box, LayoutDashboard, Boxes, Settings,
  Clock, Sparkles, Cpu, HardDrive, Bell, Terminal, ExternalLink,
  ChevronRight, Layers, Wand2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { APP_NAME } from '@/constants';
import { useUIStore } from '@/stores/useUIStore';
import { useAppStore } from '@/stores/useAppStore';
import { BackendStatusPill } from '@/components/BackendStatusPill';

const NAV_LINKS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/workspace?tab=3d-gen', label: '3D Studio', icon: Boxes },
  { href: '/workspace?tab=My+Assets', label: 'History & Timeline', icon: Clock },
  { href: '/settings?section=models', label: 'AI Models', icon: Box },
];

export function WorkspaceNavbar() {
  const [searchQuery, setSearchQuery] = useState('');
  const { mobileMenuOpen, setMobileMenuOpen } = useUIStore();
  const batchQueue = useAppStore((s) => s.batchQueue);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeBatchCount = batchQueue.filter((b) => b.status === 'running' || b.status === 'queued').length;

  const isActive = (href: string) => {
    const [p, q] = href.split('?');
    if (p !== '/' && pathname !== p) return false;
    if (p === '/' && pathname !== '/') return false;
    if (q) {
      const params = new URLSearchParams(q);
      for (const [k, v] of params) {
        if (searchParams.get(k) !== v) return false;
      }
    }
    return true;
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    // Dispatch Cmd+K palette search or trigger workspace prompt search
    document.dispatchEvent(new CustomEvent('workspace-search', { detail: { query: searchQuery } }));
  };

  return (
    <header
      className="sticky top-0 z-40 w-full bg-[#121214]/80 backdrop-blur-xl border-b border-white/5 shadow-2xl transition-all"
      id="global-workspace-navbar"
    >
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-6">
        {/* Left Section: Mobile Menu + Brand Logo + Nav Links */}
        <div className="flex items-center gap-6">
          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-xl text-white/60 hover:bg-white/5 transition-all"
            aria-label="Toggle navigation"
          >
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>

          {/* Logo & Brand Badge */}
          <Link href="/" className="flex items-center gap-3 group" aria-label="Home">
            <div className="w-9 h-9 rounded-xl bg-[#facc15] flex items-center justify-center shadow-[0_0_20px_rgba(250,204,21,0.3)] group-hover:scale-105 transition-transform">
              <Boxes size={20} className="text-[#121214]" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-base font-black tracking-tighter text-white uppercase">{APP_NAME}</span>
                <span className="px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.2em] rounded bg-[#facc15]/10 text-[#facc15] border border-[#facc15]/20">
                  PRO
                </span>
              </div>
            </div>
          </Link>

          {/* Primary Nav Links */}
          <nav className="hidden lg:flex items-center gap-2 ml-4 pl-6 border-l border-white/5" id="top-nav-links">
            {NAV_LINKS.map((link) => {
              const Icon = link.icon;
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all',
                    active
                      ? 'text-[#121214] bg-[#facc15]'
                      : 'text-white/40 hover:text-white hover:bg-white/5'
                  )}
                >
                  <Icon size={14} />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Center: Command / Search Bar */}
        <div className="flex-1 max-w-lg hidden sm:block mx-2" id="centered-search-container">
          <form onSubmit={handleSearchSubmit} className="relative w-full group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-[#facc15] transition-colors" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search prompts, assets, models..."
              className="w-full h-11 pl-12 pr-16 text-[11px] font-bold text-white bg-white/5 hover:bg-white/10 border border-transparent hover:border-white/10 rounded-2xl focus:outline-none focus:bg-[#1a1b1e] focus:border-[#facc15]/30 transition-all"
              onClick={() => {
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, ctrlKey: true, bubbles: true }));
              }}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <kbd className="text-[9px] font-black tracking-widest px-2 py-1 rounded-lg bg-black/40 text-white/20 border border-white/5">
                ⌘ K
              </kbd>
            </div>
          </form>
        </div>

        {/* Right Section: Telemetry & Actions */}
        <div className="flex items-center gap-3" id="top-nav-actions">
          {/* Active Batch Queue indicator badge */}
          {activeBatchCount > 0 && (
            <Link
              href="/workspace?tab=3d-gen"
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 text-[10px] font-black uppercase tracking-widest animate-pulse"
            >
              <Wand2 size={13} />
              <span>{activeBatchCount} Running</span>
            </Link>
          )}

          {/* Backend Status Live Pill */}
          <BackendStatusPill />

          {/* Settings Button */}
          <Link
            href="/settings"
            className={cn(
              'w-10 h-10 rounded-xl flex items-center justify-center transition-all',
              pathname.startsWith('/settings')
                ? 'bg-[#facc15] text-[#121214]'
                : 'bg-white/5 text-white/40 hover:text-white hover:bg-white/10'
            )}
            title="Studio Settings"
          >
            <Settings size={18} />
          </Link>
        </div>
      </div>

      {/* Mobile Navigation Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-[hsl(var(--border)/0.6)] bg-[hsl(var(--surface-0))] px-4 py-3 space-y-2 animate-fadeIn">
          {NAV_LINKS.map((link) => {
            const Icon = link.icon;
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  'flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all',
                  active
                    ? 'text-white bg-[hsl(var(--primary))]'
                    : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))]'
                )}
              >
                <div className="flex items-center gap-2.5">
                  <Icon size={16} />
                  <span>{link.label}</span>
                </div>
                <ChevronRight size={14} className="opacity-60" />
              </Link>
            );
          })}
        </div>
      )}
    </header>
  );
}

