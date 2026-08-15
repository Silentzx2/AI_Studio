"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
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
      className="sticky top-0 z-50 w-full bg-black/60 backdrop-blur-2xl border-b border-white/[0.03] shadow-[0_4px_30px_rgba(0,0,0,0.5)] transition-all"
      id="global-workspace-navbar"
    >
      <div className="max-w-[1800px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
        {/* Left Section: Mobile Menu + Brand Logo + Nav Links */}
        <div className="flex items-center gap-8">
          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2.5 rounded-2xl text-white/40 hover:bg-white/5 transition-all"
            aria-label="Toggle navigation"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          {/* Logo & Brand Badge */}
          <Link href="/" className="flex items-center gap-4 group transition-all duration-500" aria-label="Home">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600 flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.2)] group-hover:shadow-[0_0_35px_rgba(245,158,11,0.4)] group-hover:scale-110 transition-all duration-700 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <Boxes size={22} className="text-black relative z-10" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-sm font-black tracking-[-0.03em] text-white uppercase group-hover:text-amber-500 transition-colors duration-300">{APP_NAME}</span>
                <span className="px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.25em] rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.1)]">
                  ELITE
                </span>
              </div>
            </div>
          </Link>

          {/* Primary Nav Links */}
          <nav className="hidden lg:flex items-center gap-2 ml-4 pl-8 border-l border-white/5" id="top-nav-links">
            {NAV_LINKS.map((link) => {
              const Icon = link.icon;
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'flex items-center gap-3 px-5 py-2.5 rounded-2xl text-[9px] font-black uppercase tracking-[0.2em] transition-all duration-500 relative group overflow-hidden',
                    active
                      ? 'text-black bg-amber-500 shadow-[0_10px_25px_rgba(245,158,11,0.25)]'
                      : 'text-white/40 hover:text-white hover:bg-white/5'
                  )}
                >
                  <Icon size={14} className={cn("transition-all duration-500", active ? 'text-black scale-110' : 'text-white/20 group-hover:text-white group-hover:scale-110')} />
                  <span className="relative z-10">{link.label}</span>
                  {!active && (
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out" />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Center: Command / Search Bar */}
        <div className="flex-1 max-w-xl hidden sm:block mx-4" id="centered-search-container">
          <form onSubmit={handleSearchSubmit} className="relative w-full group">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/10 group-focus-within:text-amber-500 transition-all duration-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Orchestrate your creative intent..."
              className="w-full h-12 pl-14 pr-16 text-[10px] font-black uppercase tracking-widest text-white bg-black/40 hover:bg-black/60 border border-white/5 focus:border-amber-500/30 rounded-2xl focus:outline-none focus:bg-black shadow-inner transition-all duration-500 placeholder:text-white/10"
              onClick={() => {
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, ctrlKey: true, bubbles: true }));
              }}
            />
            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <kbd className="text-[8px] font-black tracking-[0.2em] px-2.5 py-1.5 rounded-xl bg-white/5 text-white/20 border border-white/5 select-none font-mono">
                CMD K
              </kbd>
            </div>
          </form>
        </div>

        {/* Right Section: Telemetry & Actions */}
        <div className="flex items-center gap-4" id="top-nav-actions">
          {/* Active Batch Queue indicator badge */}
          {activeBatchCount > 0 && (
            <Link
              href="/workspace?tab=3d-gen"
              className="hidden sm:flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-sky-500/5 border border-sky-500/20 text-sky-400 text-[9px] font-black uppercase tracking-[0.2em] animate-pulse shadow-[0_0_20px_rgba(14,165,233,0.1)]"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(14,165,233,0.8)]" />
              <span>{activeBatchCount} Running</span>
            </Link>
          )}

          {/* Backend Status Live Pill */}
          <div className="hidden sm:block">
            <BackendStatusPill />
          </div>

          {/* Settings Button */}
          <Link
            href="/settings"
            className={cn(
              'w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-500 shadow-lg',
              pathname.startsWith('/settings')
                ? 'bg-amber-500 text-black shadow-[0_10px_25px_rgba(245,158,11,0.25)]'
                : 'bg-white/5 text-white/20 hover:text-white hover:bg-white/10 border border-white/5 hover:border-white/10'
            )}
            title="System Orchestration"
          >
            <Settings size={20} className={cn("transition-transform duration-500", pathname.startsWith('/settings') ? 'rotate-90' : 'group-hover:rotate-45')} />
          </Link>
        </div>
      </div>

      {/* Mobile Navigation Dropdown */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="md:hidden border-t border-white/5 bg-black/90 backdrop-blur-3xl px-6 py-6 space-y-3 overflow-hidden shadow-2xl"
          >
            {NAV_LINKS.map((link) => {
              const Icon = link.icon;
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'flex items-center justify-between px-5 py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-300 border',
                    active
                      ? 'text-black bg-amber-500 border-amber-400 shadow-[0_10px_30px_rgba(245,158,11,0.2)]'
                      : 'text-white/40 hover:text-white hover:bg-white/5 border-transparent'
                  )}
                >
                  <div className="flex items-center gap-4">
                    <Icon size={18} className={active ? 'text-black' : 'text-white/20'} />
                    <span>{link.label}</span>
                  </div>
                  <ChevronRight size={16} className={cn("transition-all", active ? 'text-black translate-x-1' : 'text-white/10')} />
                </Link>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

