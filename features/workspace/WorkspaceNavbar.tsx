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
      className="fixed top-0 left-0 right-0 z-50 w-full bg-[hsl(var(--surface-0))] border-b border-[hsl(var(--border))/0.08] transition-all h-7"
      id="global-workspace-navbar"
    >
      <div className="h-full flex items-center justify-between gap-1 px-2 sm:px-3">
        {/* Left: Hamburger + Logo */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setDrawerOpen(!drawerOpen)}
            className="p-1 rounded text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))] transition-all"
            aria-label="Toggle navigation"
          >
            {drawerOpen ? <X size={13} /> : <Menu size={13} />}
          </button>

          <Link href="/" className="flex items-center" aria-label="Home">
            <div className="w-5 h-5 rounded bg-[hsl(var(--primary))] flex items-center justify-center">
              <Boxes size={10} className="text-[hsl(var(--surface-2))]" />
            </div>
          </Link>
        </div>

        {/* Center: Search */}
        <div className="flex-1 max-w-[180px] hidden sm:block mx-1" id="centered-search-container">
          <form onSubmit={handleSearchSubmit} className="relative w-full group">
            <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-[hsl(var(--muted-foreground))] group-focus-within:text-[hsl(var(--primary))] transition-colors" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="w-full h-5 pl-4 pr-1.5 text-[10px] font-medium text-[hsl(var(--foreground))] bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))/0.15] rounded-sm
                         placeholder:text-[hsl(var(--muted-foreground))/0.4]
                         focus:outline-none focus:border-[hsl(var(--border))] focus:ring-1 focus:ring-[hsl(var(--primary))/0.1]
                         transition-all"
              onClick={() => {
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, ctrlKey: true, bubbles: true }));
              }}
            />
          </form>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-0.5" id="top-nav-actions">
          <button
            onClick={() => {
              const input = document.querySelector('#centered-search-container input') as HTMLInputElement;
              input?.focus();
            }}
            className="sm:hidden p-1 rounded text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))] transition-all"
            aria-label="Search"
          >
            <Search size={12} />
          </button>

          {activeBatchCount > 0 && (
            <Link
              href="/workspace?tab=3d-gen"
              className="hidden sm:flex items-center gap-0.5 px-1 py-px rounded-sm bg-[hsl(var(--surface-3))] border border-[hsl(var(--border))/0.15] text-[hsl(var(--foreground))] text-[8px] font-semibold uppercase tracking-wider"
            >
              <Wand2 size={8} />
              <span className="hidden lg:inline">{activeBatchCount}</span>
            </Link>
          )}

          <BackendStatusPill />

          <button
            onClick={() => setDrawerOpen(!drawerOpen)}
            className="p-1 rounded text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))] transition-all"
            aria-label="Menu"
          >
            {drawerOpen ? <X size={13} /> : <Menu size={13} />}
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
          <div className="fixed top-0 right-0 bottom-0 z-50 w-[260px] bg-[hsl(var(--surface-0))] border-l border-[hsl(var(--border))/0.1] shadow-2xl transform transition-transform duration-200 ease-out translate-x-0">
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between p-3 border-b border-[hsl(var(--border))/0.08]">
                <span className="text-[10px] font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Menu</span>
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="p-1 rounded text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))] transition-all"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                {NAV_LINKS.map((link) => {
                  const Icon = link.icon;
                  const active = isActive(link.href);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setDrawerOpen(false)}
                      className={cn(
                        'flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs font-medium transition-all duration-200',
                        active
                          ? 'text-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10'
                          : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))]'
                      )}
                    >
                      <Icon size={14} />
                      <span>{link.label}</span>
                      {active && <ChevronRight size={12} className="ml-auto opacity-60" />}
                    </Link>
                  );
                })}
              </div>
              <div className="p-3 border-t border-[hsl(var(--border))/0.08]">
                <Link
                  href="/settings"
                  onClick={() => setDrawerOpen(false)}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs font-medium text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))] transition-all duration-200"
                >
                  <Settings size={14} />
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

