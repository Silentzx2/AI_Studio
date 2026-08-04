import { cn } from '@/lib/utils';
import React from 'react';

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn('rounded-xl p-4', className)}
      style={{
        background: 'rgba(8,5,20,0.70)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(168,85,247,0.12)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.40), inset 0 1px 0 rgba(255,255,255,0.03)',
      }}
    >
      {children}
    </div>
  );
}

export function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-3">
      {children}
    </h3>
  );
}

export function Badge({
  children,
  variant = 'default',
}: {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warn' | 'error' | 'info' | 'purple';
}) {
  const cls = {
    default: 'bg-[hsl(var(--surface-2))] text-[hsl(var(--muted-foreground))] border-[hsl(var(--border))]/40',
    success: 'bg-[hsl(var(--neon-green))/0.12] text-[hsl(var(--neon-green))] border-[hsl(var(--neon-green))]/25',
    warn:    'bg-[hsl(var(--neon-amber))/0.12] text-[hsl(var(--neon-amber))] border-[hsl(var(--neon-amber))]/25',
    error:   'bg-[hsl(var(--destructive))/0.12] text-[hsl(var(--destructive))] border-[hsl(var(--destructive))]/25',
    info:    'bg-[hsl(var(--neon-blue))/0.12] text-[hsl(var(--neon-blue))] border-[hsl(var(--neon-blue))]/25',
    purple:  'bg-[hsl(var(--neon-purple)/0.15)] text-[hsl(var(--primary))] border-[hsl(var(--neon-purple)/0.3)]',
  }[variant];
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border', cls)}>
      {children}
    </span>
  );
}

export function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={cn(
        'inline-block w-2 h-2 rounded-full',
        ok ? 'bg-[hsl(var(--neon-green))] shadow-[0_0_6px_rgba(52,211,153,0.6)]' : 'bg-[hsl(var(--destructive))] shadow-[0_0_6px_rgba(248,113,113,0.5)]',
      )}
    />
  );
}

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <div
      className="rounded-full animate-spin"
      style={{
        width: size,
        height: size,
        border: `2px solid rgba(168,85,247,0.20)`,
        borderTopColor: 'rgba(168,85,247,0.9)',
      }}
    />
  );
}

export function SectionHeader({ children, subtitle }: { children: React.ReactNode; subtitle?: string }) {
  return (
    <div className="mb-1">
      <h2 className="text-xl font-bold text-[hsl(var(--foreground))]">{children}</h2>
      {subtitle && <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">{subtitle}</p>}
    </div>
  );
}

export function ActionButton({
  children,
  onClick,
  variant = 'default',
  disabled = false,
  small = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'primary' | 'danger' | 'success';
  disabled?: boolean;
  small?: boolean;
}) {
  const base = 'inline-flex items-center justify-center gap-1.5 font-medium rounded-lg transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.97]';
  const size = small ? 'px-2.5 py-1.5 text-xs' : 'px-4 py-2 text-sm';
  const cls = {
    default: 'bg-slate-700/50 hover:bg-slate-600/60 text-[hsl(var(--muted-foreground))] border border-slate-600/40 hover:border-slate-500/60 hover:text-[hsl(var(--foreground))]',
    primary: 'text-[hsl(var(--foreground))] border border-[hsl(var(--neon-purple)/0.3)] hover:border-violet-400/50 hover:shadow-[0_0_16px_rgba(168,85,247,0.25)]',
    danger:  'bg-red-600/20 hover:bg-red-600/30 text-[hsl(var(--destructive))] border border-[hsl(var(--destructive)/0.2)] hover:border-[hsl(var(--destructive)/0.4)]',
    success: 'bg-emerald-600/20 hover:bg-emerald-600/30 text-[hsl(var(--neon-green))] border border-[hsl(var(--neon-green)/0.2)] hover:border-[hsl(var(--neon-green))]/40',
  }[variant];

  const primaryStyle = variant === 'primary' ? {
    background: 'linear-gradient(135deg, rgba(124,58,237,0.60) 0%, rgba(168,85,247,0.50) 100%)',
  } : {};

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(base, size, cls)}
      style={primaryStyle}
    >
      {children}
    </button>
  );
}

export function ProgressBar({ value, color = 'violet' }: { value: number; color?: 'violet' | 'cyan' | 'emerald' | 'amber' | 'red' }) {
  const gradient = {
    violet: 'linear-gradient(90deg, rgba(124,58,237,0.9), rgba(168,85,247,0.9))',
    cyan:   'linear-gradient(90deg, rgba(6,182,212,0.9), rgba(59,130,246,0.9))',
    emerald:'linear-gradient(90deg, rgba(16,185,129,0.9), rgba(52,211,153,0.9))',
    amber:  'linear-gradient(90deg, rgba(245,158,11,0.9), rgba(251,191,36,0.9))',
    red:    'linear-gradient(90deg, rgba(239,68,68,0.9), rgba(248,113,113,0.9))',
  }[color];

  const pct = Math.min(100, Math.max(0, value));
  const glowColor = {
    violet: 'rgba(168,85,247,0.50)',
    cyan:   'rgba(6,182,212,0.50)',
    emerald:'rgba(16,185,129,0.50)',
    amber:  'rgba(245,158,11,0.50)',
    red:    'rgba(239,68,68,0.50)',
  }[color];

  return (
    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{
          width: `${pct}%`,
          background: gradient,
          boxShadow: `0 0 8px ${glowColor}`,
        }}
      />
    </div>
  );
}

export function DataTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(168,85,247,0.10)' }}>
            {headers.map((h) => (
              <th key={h} className="text-left py-2.5 px-3 text-[11px] font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className="transition-colors hover:bg-[hsl(var(--primary)/0.04)]"
              style={{ borderBottom: '1px solid rgba(168,85,247,0.06)' }}
            >
              {row.map((cell, j) => (
                <td key={j} className="py-2.5 px-3 text-[hsl(var(--muted-foreground))] text-sm">{cell}</td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={headers.length} className="py-8 text-center text-[hsl(var(--muted-foreground))] text-xs">
                No data available
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function MetricCard({
  label,
  value,
  unit,
  sub,
  icon: Icon,
  color = 'violet',
  progress,
}: {
  label: string;
  value: string | number;
  unit?: string;
  sub?: string;
  icon?: any;
  color?: 'violet' | 'cyan' | 'emerald' | 'amber' | 'red';
  progress?: number;
}) {
  const iconColors = {
    violet: 'text-[hsl(var(--neon-purple))]',
    cyan:   'text-[hsl(var(--neon-cyan))]',
    emerald:'text-[hsl(var(--neon-green))]',
    amber:  'text-[hsl(var(--neon-amber))]',
    red:    'text-[hsl(var(--destructive))]',
  }[color];

  const iconBg = {
    violet: 'rgba(168,85,247,0.10)',
    cyan:   'rgba(6,182,212,0.10)',
    emerald:'rgba(16,185,129,0.10)',
    amber:  'rgba(245,158,11,0.10)',
    red:    'rgba(239,68,68,0.10)',
  }[color];

  return (
    <Card>
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-[11px] text-[hsl(var(--muted-foreground))] font-medium uppercase tracking-wider mb-1">{label}</p>
          <p className="text-2xl font-bold text-[hsl(var(--foreground))]">
            {value}
            {unit && <span className="text-sm text-[hsl(var(--muted-foreground))] ml-1 font-normal">{unit}</span>}
          </p>
          {sub && <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">{sub}</p>}
        </div>
        {Icon && (
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: iconBg }}>
            <Icon size={17} className={iconColors} />
          </div>
        )}
      </div>
      {progress !== undefined && <ProgressBar value={progress} color={color} />}
    </Card>
  );
}
