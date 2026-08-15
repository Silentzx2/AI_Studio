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
    document.dispatchEvent(new CustomEvent('workspace-search', { detail: { query: searchQuery } }));
  };

  return (
    <header
      className="sticky top-0 z-40 w-full bg-[hsl(var(--surface-1))/0.95] backdrop-blur-xl border-b border-[hsl(var(--border))/0.2] transition-all h-12 shadow-sm"
      id="global-workspace-navbar"
    >
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 h-full flex items-center justify-between gap-4">
        {/* Left Section: Mobile Menu + Brand Logo + Nav Links */}
        <div className="flex items-center gap-3">
          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))] transition-all btn-icon"
            aria-label="Toggle navigation"
          >
            {mobileMenuOpen ? <X size={16} /> : <Menu size={16} />}
          </button>

          {/* Logo & Brand Badge */}
          <Link href="/" className="flex items-center gap-2 group" aria-label="Home">
            <div className="w-7 h-7 rounded-lg bg-[hsl(var(--primary))] flex items-center justify-center shadow-[0_0_12px_hsl(var(--primary)/0.15)] group-hover:scale-105 transition-transform duration-200">
              <Boxes size={16} className="text-[hsl(var(--surface-2))]" />
            </div>
            <div className="flex flex-col hidden sm:flex">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-black tracking-tighter text-white uppercase">{APP_NAME}</span>
                <span className="px-1.5 py-0.5 text-[7px] font-black uppercase tracking-[0.2em] rounded bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] border border-[hsl(var(--primary))]/20">
                  PRO
                </span>
              </div>
            </div>
          </Link>

          {/* Primary Nav Links */}
          <nav className="hidden lg:flex items-center gap-1 ml-2 pl-3 border-l border-[hsl(var(--border))/0.2]" id="top-nav-links">
            {NAV_LINKS.map((link) => {
              const Icon = link.icon;
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all duration-200',
                    active
                      ? 'text-[hsl(var(--surface-2))] bg-[hsl(var(--primary))] shadow-[0_0_10px_hsl(var(--primary)/0.15)]'
                      : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))]'
                  )}
                >
                  <Icon size={12} />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Center: Command / Search Bar */}
        <div className="flex-1 max-w-lg hidden sm:block mx-2" id="centered-search-container">
          <form onSubmit={handleSearchSubmit} className="relative w-full group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[hsl(var(--muted-foreground))] group-focus-within:text-[hsl(var(--primary))] transition-colors duration-200" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search prompts, assets, models..."
              className="w-full h-9 pl-10 pr-4 text-[11px] font-medium text-[hsl(var(--foreground))] bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))/0.3] rounded-lg
                         placeholder:text-[hsl(var(--muted-foreground))/0.4]
                         hover:border-[hsl(var(--border))/0.5]
                         focus:outline-none focus:bg-[hsl(var(--surface-2))] focus:border-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--primary))/0.2]
                         transition-all duration-200"
              onClick={() => {
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, ctrlKey: true, bubbles: true }));
              }}
            />
          </form>
        </div>

        {/* Right Section: Telemetry & Actions */}
        <div className="flex items-center gap-2" id="top-nav-actions">
          {/* Active Batch Queue indicator badge */}
          {activeBatchCount > 0 && (
            <Link
              href="/workspace?tab=3d-gen"
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[hsl(var(--neon-blue))/0.1] border border-[hsl(var(--neon-blue))/0.2] text-[hsl(var(--neon-blue))] text-[9px] font-black uppercase tracking-wider animate-pulse badge-status-info"
            >
              <Wand2 size={11} />
              <span>{activeBatchCount} Running</span>
            </Link>
          )}

          {/* Backend Status Live Pill */}
          <BackendStatusPill />

          {/* Settings Button */}
          <Link
            href="/settings"
            className={cn(
              'w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-200 btn-icon',
              pathname.startsWith('/settings')
                ? 'bg-[hsl(var(--primary))/0.1] text-[hsl(var(--primary))]'
                : ''
            )}
            title="Studio Settings"
          >
            <Settings size={16} />
          </Link>
        </div>
      </div>

      {/* Mobile Navigation Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-[hsl(var(--border))/0.2] bg-[hsl(var(--surface-0))] px-4 py-3 space-y-1 animate-fadeIn">
          {NAV_LINKS.map((link) => {
            const Icon = link.icon;
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  'flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold transition-all duration-200',
                  active
                    ? 'text-[hsl(var(--primary))] bg-[hsl(var(--primary))/0.1]'
                    : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))]'
                )}
              >
                <div className="flex items-center gap-2">
                  <Icon size={14} />
                  <span>{link.label}</span>
                </div>
                <ChevronRight size={12} className="opacity-60" />
              </Link>
            );
          })}
        </div>
      )}
    </header>
  );
}

