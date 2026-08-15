"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  Search, Menu, X, Boxes, Settings, Wand2, ChevronRight, LayoutDashboard, Clock, Box
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/useUIStore';
import { useAppStore } from '@/stores/useAppStore';
import { BackendStatusPill } from '@/components/BackendStatusPill';

const NAV_LINKS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/workspace?tab=3d-gen', label: '3D Studio', icon: Boxes },
  { href: '/workspace?tab=My+Assets', label: 'History', icon: Clock },
  { href: '/settings?section=models', label: 'AI Models', icon: Box },
];

export function WorkspaceNavbar() {
  const [searchQuery, setSearchQuery] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
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
      className="fixed top-0 left-0 right-0 z-50 w-full bg-[hsl(var(--surface-1))/0.95] backdrop-blur-xl border-b border-[hsl(var(--border))/0.15] transition-all h-9"
      id="global-workspace-navbar"
    >
      <div className="h-full flex items-center justify-between gap-2 px-3 sm:px-4">
        {/* Left: Logo */}
        <div className="flex items-center gap-2">
          <Link href="/" className="flex items-center" aria-label="Home">
            <div className="w-6 h-6 rounded-md bg-[hsl(var(--primary))] flex items-center justify-center">
              <Boxes size={12} className="text-[hsl(var(--surface-2))]" />
            </div>
          </Link>
        </div>

        {/* Center: Search — ultra compact */}
        <div className="flex-1 max-w-sm hidden sm:block mx-2" id="centered-search-container">
          <form onSubmit={handleSearchSubmit} className="relative w-full group">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[hsl(var(--muted-foreground))] group-focus-within:text-[hsl(var(--primary))] transition-colors duration-200" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="w-full h-7 pl-7 pr-2 text-[11px] font-medium text-[hsl(var(--foreground))] bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))/0.2] rounded
                         placeholder:text-[hsl(var(--muted-foreground))/0.4]
                         hover:border-[hsl(var(--border))/0.4]
                         focus:outline-none focus:bg-[hsl(var(--surface-2))] focus:border-[hsl(var(--border))] focus:ring-1 focus:ring-[hsl(var(--primary))/0.1]
                         transition-all duration-200"
              onClick={() => {
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, ctrlKey: true, bubbles: true }));
              }}
            />
          </form>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1" id="top-nav-actions">
          {/* Mobile search toggle */}
          <button
            onClick={() => {
              const input = document.querySelector('#centered-search-container input') as HTMLInputElement;
              input?.focus();
            }}
            className="sm:hidden p-1 rounded text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))] transition-all"
            aria-label="Search"
          >
            <Search size={14} />
          </button>

          {activeBatchCount > 0 && (
            <Link
              href="/workspace?tab=3d-gen"
              className="hidden sm:flex items-center gap-1 px-1.5 py-0.5 rounded bg-[hsl(var(--surface-3))] border border-[hsl(var(--border))/0.2] text-[hsl(var(--foreground))] text-[9px] font-semibold uppercase tracking-wider"
            >
              <Wand2 size={10} />
              <span className="hidden lg:inline">{activeBatchCount}</span>
            </Link>
          )}

          <BackendStatusPill />

          <button
            onClick={() => setDrawerOpen(!drawerOpen)}
            className="p-1 rounded text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))] transition-all"
            aria-label="Menu"
          >
            {drawerOpen ? <X size={14} /> : <Menu size={14} />}
          </button>
        </div>
      </div>

      {/* Right-side Navigation Drawer */}
      {drawerOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="fixed top-0 right-0 bottom-0 z-50 w-[280px] bg-[hsl(var(--surface-1))] border-l border-[hsl(var(--border))/0.15] shadow-2xl transform transition-transform duration-200 ease-out translate-x-0">
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between p-4 border-b border-[hsl(var(--border))/0.1]">
                <span className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Menu</span>
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="p-1 rounded text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))] transition-all"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-1">
                {NAV_LINKS.map((link) => {
                  const Icon = link.icon;
                  const active = isActive(link.href);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setDrawerOpen(false)}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                        active
                          ? 'text-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10'
                          : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))]'
                      )}
                    >
                      <Icon size={16} />
                      <span>{link.label}</span>
                      {active && <ChevronRight size={14} className="ml-auto opacity-60" />}
                    </Link>
                  );
                })}
              </div>
              <div className="p-4 border-t border-[hsl(var(--border))/0.1]">
                <Link
                  href="/settings"
                  onClick={() => setDrawerOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))] transition-all duration-200"
                >
                  <Settings size={16} />
                  <span>Settings</span>
                </Link>
              </div>
            </div>
          </div>
        </>
      )}
    </header>
  );
}

