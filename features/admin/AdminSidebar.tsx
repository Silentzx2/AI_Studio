'use client';
import Link from 'next/link';
import type { AdminTab } from './AdminShell';
import {
  LayoutDashboard, Layers, Package, Download, ListOrdered,
  Cpu, ScrollText, Settings, Activity, Container,
  BriefcaseBusiness, Terminal, ChevronRight, ExternalLink,
  Boxes, Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const PRIMARY_NAV: { id: AdminTab | null; label: string; icon: React.ElementType; href?: string; badge?: string }[] = [
  { id: 'overview', label: 'Dashboard', icon: LayoutDashboard },
  { id: null, label: 'Workspace', icon: Layers, href: '/workspace' },
  { id: 'models', label: 'Models', icon: Package },
  { id: 'queue', label: 'Queue', icon: ListOrdered },
  { id: 'runtime', label: 'Runtime', icon: Cpu },
  { id: 'logs', label: 'Live Logs', icon: ScrollText },
  { id: null, label: 'Settings', icon: Settings, href: '/settings' },
];

const ADMIN_NAV: { id: AdminTab; label: string; icon: React.ElementType }[] = [
  { id: 'health', label: 'Health', icon: Activity },
  { id: 'docker', label: 'Docker', icon: Container },
  { id: 'jobs', label: 'Jobs', icon: BriefcaseBusiness },
  { id: 'terminal', label: 'Terminal', icon: Terminal },
  { id: 'settings', label: 'Config', icon: Settings },
];

export default function AdminSidebar({
  active,
  onChange,
}: {
  active: AdminTab;
  onChange: (t: AdminTab) => void;
}) {
  return (
    <aside
      className="w-60 shrink-0 h-full flex flex-col"
      style={{
        background: 'rgba(6,3,16,0.95)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderRight: '1px solid rgba(168,85,247,0.12)',
      }}
    >
      {/* Logo */}
      <div className="px-5 py-5" style={{ borderBottom: '1px solid rgba(168,85,247,0.10)' }}>
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: 'linear-gradient(135deg, rgba(168,85,247,0.9) 0%, rgba(124,58,237,0.8) 100%)',
              boxShadow: '0 0 16px rgba(168,85,247,0.40)',
            }}
          >
            <Boxes size={18} className="text-white" />
          </div>
          <div>
            <p className="text-[11px] font-bold tracking-[0.15em] text-violet-400 uppercase">AI Studio</p>
            <p className="text-xs font-medium text-slate-300 mt-0.5">Control Panel</p>
          </div>
        </div>
      </div>

      {/* Main nav */}
      <nav className="flex-1 overflow-y-auto py-4 space-y-0.5 px-3 hide-scrollbar">
        <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider px-2 pb-2">Navigation</p>
        {PRIMARY_NAV.map(({ id, label, icon, href, badge }) => {
          const Icon = icon as any;
          const isActive = id !== null && active === id;
          const content = (
            <>
              <div className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all duration-200',
                isActive
                  ? 'bg-violet-600/30'
                  : 'bg-transparent group-hover:bg-violet-500/10',
              )}>
                <Icon size={15} className={cn(
                  'transition-colors duration-200',
                  isActive ? 'text-violet-300' : 'text-slate-500 group-hover:text-slate-300',
                )} />
              </div>
              <span className={cn(
                'flex-1 text-sm transition-colors duration-200',
                isActive ? 'text-white font-medium' : 'text-slate-400 group-hover:text-slate-200',
              )}>{label}</span>
              {badge && (
                <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-violet-600/30 text-violet-300 border border-violet-500/20">
                  {badge}
                </span>
              )}
              {href && <ExternalLink size={11} className="text-slate-600 group-hover:text-slate-400 transition-colors" />}
              {isActive && <ChevronRight size={13} className="text-violet-400" />}
            </>
          );

          const baseClass = cn(
            'group w-full flex items-center gap-2.5 px-2 py-2 rounded-lg transition-all duration-200 text-left relative',
            isActive
              ? 'bg-violet-600/15 border border-violet-500/20'
              : 'hover:bg-violet-500/05 border border-transparent hover:border-violet-500/10',
          );

          if (href) {
            return (
              <Link key={label} href={href} className={baseClass}>
                {content}
              </Link>
            );
          }

          return (
            <button
              key={id}
              onClick={() => id && onChange(id)}
              className={baseClass}
            >
              {isActive && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full"
                  style={{ background: 'linear-gradient(to bottom, rgba(168,85,247,0.9), rgba(124,58,237,0.6))' }}
                />
              )}
              {content}
            </button>
          );
        })}

        {/* Admin section */}
        <div className="pt-4">
          <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider px-2 pb-2">Admin</p>
          {ADMIN_NAV.map(({ id, label, icon }) => {
            const Icon = icon as any;
            const isActive = active === id;
            return (
              <button
                key={id}
                onClick={() => onChange(id)}
                className={cn(
                  'group w-full flex items-center gap-2.5 px-2 py-2 rounded-lg transition-all duration-200 text-left relative border',
                  isActive
                    ? 'bg-violet-600/15 border-violet-500/20'
                    : 'hover:bg-violet-500/05 border-transparent hover:border-violet-500/10',
                )}
              >
                {isActive && (
                  <span
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-r-full"
                    style={{ background: 'linear-gradient(to bottom, rgba(168,85,247,0.8), rgba(124,58,237,0.5))' }}
                  />
                )}
                <div className={cn(
                  'w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all',
                  isActive ? 'bg-violet-600/25' : 'group-hover:bg-violet-500/08',
                )}>
                  <Icon size={14} className={cn(
                    isActive ? 'text-violet-300' : 'text-slate-600 group-hover:text-slate-400',
                  )} />
                </div>
                <span className={cn(
                  'text-xs transition-colors',
                  isActive ? 'text-slate-200 font-medium' : 'text-slate-600 group-hover:text-slate-400',
                )}>{label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* System status indicator */}
      <div className="px-3 py-2" style={{ borderTop: '1px solid rgba(168,85,247,0.08)' }}>
        <div className="flex items-center gap-2 px-2 py-2 rounded-lg bg-emerald-500/05 border border-emerald-500/10">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
          <span className="text-[11px] text-emerald-400 font-medium">System Online</span>
        </div>
      </div>

      {/* User footer */}
      <div className="px-3 py-3" style={{ borderTop: '1px solid rgba(168,85,247,0.08)' }}>
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-violet-500/05 transition-colors cursor-pointer group">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-white"
            style={{ background: 'linear-gradient(135deg, rgba(168,85,247,0.8), rgba(99,51,189,0.8))' }}
          >
            Z
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-300 truncate">ZeroByte</p>
            <p className="text-[10px] text-slate-600 truncate">Administrator</p>
          </div>
          <Link href="/" className="text-slate-600 hover:text-slate-400 transition-colors" title="Back to app">
            <ExternalLink size={12} />
          </Link>
        </div>
      </div>
    </aside>
  );
}
