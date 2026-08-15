"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  Search, Menu, X, Box, LayoutDashboard, Boxes, Settings,
  Clock, Wand2, ChevronRight
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
      className="sticky top-0 z-40 w-full bg-[hsl(var(--surface-1))/0.95] backdrop-blur-xl border-b border-[hsl(var(--border))/0.15] transition-all h-10"
      id="global-workspace-navbar"
    >
      <div className="h-full flex items-center justify-between gap-2 px-3 sm:px-4">
        {/* Left: Hamburger + Logo + Nav Icons */}
        <div className="flex items-center gap-1">
          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-1.5 rounded-lg text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))] transition-all"
            aria-label="Toggle navigation"
          >
            {mobileMenuOpen ? <X size={16} /> : <Menu size={16} />}
          </button>

          {/* Logo icon only (no text — sidebar already shows AI Studio) */}
          <Link href="/" className="flex items-center" aria-label="Home">
            <div className="w-7 h-7 rounded-lg bg-[hsl(var(--primary))] flex items-center justify-center transition-transform duration-200 hover:scale-105">
              <Boxes size={14} className="text-[hsl(var(--surface-2))]" />
            </div>
          </Link>

          {/* Desktop Nav — icon pills */}
          <nav className="hidden md:flex items-center gap-0.5 ml-1" id="top-nav-links">
            {NAV_LINKS.map((link) => {
              const Icon = link.icon;
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-200',
                    active
                      ? 'text-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10'
                      : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))]'
                  )}
                  title={link.label}
                >
                  <Icon size={14} />
                  <span className="hidden xl:inline">{link.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Center: Search — compact on desktop, hidden on mobile */}
        <div className="flex-1 max-w-md hidden sm:block mx-2" id="centered-search-container">
          <form onSubmit={handleSearchSubmit} className="relative w-full group">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[hsl(var(--muted-foreground))] group-focus-within:text-[hsl(var(--primary))] transition-colors duration-200" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="w-full h-8 pl-8 pr-3 text-[11px] font-medium text-[hsl(var(--foreground))] bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))/0.3] rounded-md
                         placeholder:text-[hsl(var(--muted-foreground))/0.4]
                         hover:border-[hsl(var(--border))/0.5]
                         focus:outline-none focus:bg-[hsl(var(--surface-2))] focus:border-[hsl(var(--border))] focus:ring-1.5 focus:ring-[hsl(var(--primary))/0.15]
                         transition-all duration-200"
              onClick={() => {
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, ctrlKey: true, bubbles: true }));
              }}
            />
          </form>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5" id="top-nav-actions">
          {/* Mobile search toggle */}
          <button
            onClick={() => {
              const input = document.querySelector('#centered-search-container input') as HTMLInputElement;
              input?.focus();
            }}
            className="sm:hidden p-1.5 rounded-lg text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))] transition-all"
            aria-label="Search"
          >
            <Search size={14} />
          </button>

          {activeBatchCount > 0 && (
            <Link
              href="/workspace?tab=3d-gen"
              className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-md bg-[hsl(var(--surface-3))] border border-[hsl(var(--border))/0.3] text-[hsl(var(--foreground))] text-[9px] font-semibold uppercase tracking-wider"
            >
              <Wand2 size={10} />
              <span className="hidden lg:inline">{activeBatchCount} Running</span>
            </Link>
          )}

          <BackendStatusPill />

          <Link
            href="/settings"
            className={cn(
              'w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200',
              pathname.startsWith('/settings')
                ? 'bg-[hsl(var(--primary))/0.1] text-[hsl(var(--primary))]'
                : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))]'
            )}
            title="Studio Settings"
          >
            <Settings size={14} />
          </Link>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-[hsl(var(--border))/0.15] bg-[hsl(var(--surface-0))] px-3 py-2 space-y-0.5">
          {NAV_LINKS.map((link) => {
            const Icon = link.icon;
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  'flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                  active
                    ? 'text-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10'
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

