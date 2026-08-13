"use client";

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  Search, Menu, X, Box, LayoutDashboard, Boxes, Settings
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { APP_NAME } from '@/constants';
import { useUIStore } from '@/stores/useUIStore';
import { BackendStatusPill } from '@/components/BackendStatusPill';

const NAV_LINKS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/workspace?tab=3d-gen', label: '3D Gen', icon: Boxes },
  // ponytail: unified model management lives under settings?section=models
  { href: '/settings?section=models', label: 'Models', icon: Box },
];

export function WorkspaceNavbar() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState<null | {query: string}>(null);
  const { mobileMenuOpen, setMobileMenuOpen } = useUIStore();
  const pathname = usePathname();
  const searchParams = useSearchParams();

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

const handleSearch = (query: string) => {
  setSearchResult({ query });
  // In production, this would dispatch a search event or call an API
  console.log(`Search query: ${query}`);
};

  return (
    <header className="glass-frosted shrink-0 z-30 relative border-b border-[hsl(var(--border)/0.6)]" style={{ boxShadow: '0 1px 2px hsl(var(--surface-0) / 0.4)' }}>
      {/* Bottom divider line */}
      <div className="divider-gradient opacity-60" />

      <div className="flex items-center gap-3 h-12 px-4 sm:px-6">
        {/* Mobile hamburger — opens the main navigation drawer */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="lg:hidden p-2 rounded-lg text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))] transition-colors"
          aria-label="Toggle navigation"
        >
          {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>

        {/* Brand */}
        <Link href="/" className="hidden sm:flex items-center gap-2 shrink-0 group" aria-label="Home">
          <span className="w-7 h-7 rounded-lg bg-gradient-to-tr from-[hsl(var(--primary))] to-[hsl(var(--primary))/0.55] flex items-center justify-center shadow-sm shadow-[hsl(var(--primary))/0.25] group-hover:scale-105 transition-transform">
            <Boxes size={15} className="text-white" />
          </span>
          <span className="text-sm font-black tracking-tight hidden md:block">{APP_NAME}</span>
        </Link>

        {/* Quick navigation links (left of search) */}
        <nav className="hidden lg:flex items-center gap-0.5" id="top-nav-links">
          {NAV_LINKS.map((link) => {
            const Icon = link.icon;
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wide transition-all',
                  active
                    ? 'text-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10 border border-[hsl(var(--primary))]/25'
                    : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--foreground)/0.04)] border border-transparent'
                )}
              >
                <Icon size={14} />
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Search - Centered */}
        <div className="flex-1 flex justify-center min-w-0" id="centered-search-container">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                handleSearch(e.target.value);
              }}
              placeholder="Search commands (e.g., generate, materials...)"
              className="input-premium w-full h-8 pl-9 pr-14 text-xs text-foreground bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] rounded-lg focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))] transition-all"
              onClick={() => {
                // Trigger Cmd+K / Ctrl+K to open the command palette
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, ctrlKey: true, bubbles: true }));
              }}
            />
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none chip text-[9px] font-mono leading-none px-1.5 py-0.5 text-muted-foreground bg-[hsl(var(--surface-2))] border border-[hsl(var(--border)/0.5)] rounded">
              ⌘K
            </kbd>
          </div>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2" id="top-nav-actions">
          <BackendStatusPill />
          <Link
            href="/settings"
            className="p-2 rounded-lg text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))] transition-colors"
            title="Settings"
            aria-label="Settings"
          >
            <Settings size={16} />
          </Link>
        </div>
      </div>
    </header>
  );
}
