"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  Search, Menu, X, Boxes, Settings, Wand2, ChevronRight, ChevronDown, LayoutDashboard, Clock, Box
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
      className="fixed top-0 left-0 right-0 z-50 w-full bg-tripo-gray-3 border-b border-tripo-white-5 transition-all h-12"
      id="global-workspace-navbar"
    >
      <div className="h-full flex items-center justify-between gap-1 px-3 sm:px-4 max-w-7xl mx-auto">
        {/* Left: Logo + Brand */}
        <div className="flex items-center gap-2">
          <Link href="/" className="flex items-center" aria-label="Home">
            <div className="w-8 h-8 rounded-full bg-tripo-yellow-1 flex items-center justify-center">
              <Boxes size={16} className="text-tripo-gray-3" />
            </div>
          </Link>
          <span className="text-3.5 font-bold text-tripo-gray-100 hidden sm:block">AI Studio</span>
        </div>

        {/* Center: Nav Links */}
        <nav className="hidden md:flex items-center gap-1" id="centered-nav-links">
          {NAV_LINKS.map((link) => {
            const Icon = link.icon;
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 rounded-full text-3.5 font-medium transition-all duration-150',
                  active
                    ? 'bg-tripo-gray-4 text-tripo-yellow-1'
                    : 'text-tripo-gray-300 hover:text-tripo-gray-100 hover:bg-tripo-white-5'
                )}
              >
                <Icon size={16} />
                <span>{link.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Right: Actions */}
        <div className="flex items-center gap-2" id="top-nav-actions">
          <button
            onClick={() => {
              const input = document.querySelector('#centered-search-container input') as HTMLInputElement;
              input?.focus();
            }}
            className="sm:hidden p-2 rounded-full text-tripo-gray-300 hover:text-tripo-gray-100 hover:bg-tripo-white-5 transition-all"
            aria-label="Search"
          >
            <Search size={16} />
          </button>

          {activeBatchCount > 0 && (
            <Link
              href="/workspace?tab=3d-gen"
              className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-tripo-gray-4 border border-tripo-white-10 text-tripo-gray-100 text-3 font-medium"
            >
              <Wand2 size={14} />
              <span className="hidden lg:inline">{activeBatchCount}</span>
            </Link>
          )}

          <BackendStatusPill />

          <button className="hidden sm:flex items-center gap-1.5 px-4 py-2 rounded-full bg-tripo-yellow-1 text-tripo-gray-3 font-bold text-3.5 shadow-[0_0_15px_hsl(var(--tripo-yellow-1)/0.4)] hover:brightness-110 active:scale-[0.98] transition-all">
            Get Started
          </button>

          <button className="hidden lg:flex items-center gap-1 px-2 py-1.5 rounded-full text-tripo-gray-300 hover:text-tripo-gray-100 hover:bg-tripo-white-5 transition-all text-3">
            EN <ChevronDown size={12} />
          </button>

          <button
            onClick={() => setDrawerOpen(!drawerOpen)}
            className="p-2 rounded-full text-tripo-gray-300 hover:text-tripo-gray-100 hover:bg-tripo-white-5 transition-all"
            aria-label="Menu"
          >
            {drawerOpen ? <X size={18} /> : <Menu size={18} />}
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
          <div className="fixed top-0 right-0 bottom-0 z-50 w-[280px] bg-tripo-gray-3 border-l border-tripo-white-5 shadow-2xl">
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between p-3 border-b border-tripo-white-5">
                <span className="text-3 font-semibold text-tripo-gray-100 uppercase tracking-wider">Menu</span>
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="p-1 rounded text-tripo-gray-300 hover:text-tripo-gray-100 hover:bg-tripo-white-5 transition-all"
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
                        'flex items-center gap-2.5 px-2.5 py-2 rounded-md text-3.5 font-medium transition-all duration-200',
                        active
                          ? 'text-tripo-yellow-1 bg-tripo-gray-4'
                          : 'text-tripo-gray-300 hover:text-tripo-gray-100 hover:bg-tripo-white-5'
                      )}
                    >
                      <Icon size={14} />
                      <span>{link.label}</span>
                      {active && <ChevronRight size={12} className="ml-auto opacity-60" />}
                    </Link>
                  );
                })}
              </div>
              <div className="p-3 border-t border-tripo-white-5">
                <Link
                  href="/settings"
                  onClick={() => setDrawerOpen(false)}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-3.5 font-medium text-tripo-gray-300 hover:text-tripo-gray-100 hover:bg-tripo-white-5 transition-all duration-200"
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

