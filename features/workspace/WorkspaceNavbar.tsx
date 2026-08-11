"use client";


import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Bell, Menu, X, Box, ChevronDown,
  PanelLeft, PanelRight, LayoutDashboard, Boxes, Package
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { APP_NAME } from '@/constants';
import { useUIStore } from '@/stores/useUIStore';

const NAV_LINKS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/workspace', label: 'Workspace', icon: Box },
  // ponytail: Changed /models to /settings?section=models - unified model management
  { href: '/settings?section=models', label: 'Models', icon: Boxes },
  { href: '/settings', label: 'Settings', icon: Package },
];

export function WorkspaceNavbar() {
  const [searchQuery, setSearchQuery] = useState('');
  const { mobileMenuOpen, setMobileMenuOpen } = useUIStore();

  return (
    <header className="glass-frosted shrink-0 z-30 relative" style={{ boxShadow: '0 1px 0 0 hsl(var(--neon-purple) / 0.08), 0 4px 20px hsl(var(--surface-0) / 0.3)' }}>
      {/* Bottom gradient divider line with glow */}
      <div className="divider-gradient" style={{ boxShadow: '0 0 8px hsl(var(--neon-purple) / 0.15)' }} />

      <div className="flex items-center justify-center h-12 px-4 sm:px-6">
        {/* Mobile hamburger — opens the main navigation drawer */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="lg:hidden absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-lg text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))] transition-colors"
          aria-label="Toggle navigation"
        >
          {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>

        {/* Search - Centered and beautifully proportioned */}
        <div className="relative w-full max-w-md mx-auto" id="centered-search-container">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search commands (e.g., generate, materials...)"
            className="input-premium w-full h-8 pl-9 pr-14 text-xs text-foreground bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] rounded-lg focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))] transition-all"
            readOnly
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
    </header>
  );
}