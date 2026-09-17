'use client';

import * as React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { MOTION_SPRING } from '@/lib/motion';

interface TabItem {
  id: string;
  label: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  badge?: string | number;
  disabled?: boolean;
}

export interface AnimatedTabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (tabId: string) => void;
  className?: string;
  tabClassName?: string;
  activeTabClassName?: string;
  activeIndicatorClassName?: string;
  layoutIdPrefix?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const AnimatedTabs: React.FC<AnimatedTabsProps> = ({
  tabs,
  activeTab,
  onChange,
  className = '',
  tabClassName = '',
  activeTabClassName,
  activeIndicatorClassName = '',
  layoutIdPrefix = 'tab-pill',
  size = 'md',
}) => {
  const prefersReducedMotion = useReducedMotion();
  const id = React.useId();
  const layoutId = `${layoutIdPrefix}-${id}`;

  const sizeClasses = {
    sm: 'h-8 text-xs px-2.5 gap-1.5',
    md: 'h-9 text-xs px-3 gap-2',
    lg: 'h-10 text-sm px-4 gap-2.5',
  };

  return (
    <div
      role="tablist"
      className={cn(
        'inline-flex items-center rounded-xl p-1 bg-surface-0 border border-white/[0.06] select-none',
        className
      )}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const Icon = tab.icon;

        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={isActive}
            disabled={tab.disabled}
            onClick={() => onChange(tab.id)}
            className={cn(
              'relative rounded-lg font-medium transition-colors duration-150 cursor-pointer flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed',
              sizeClasses[size],
              isActive ? (activeTabClassName || 'text-primary font-bold') : 'text-zinc-400 hover:text-zinc-200',
              tabClassName
            )}
          >
            {/* Sliding background indicator pill */}
            {isActive && (
              <motion.div
                layoutId={prefersReducedMotion ? undefined : layoutId}
                transition={MOTION_SPRING}
                className={cn(
                  'absolute inset-0 rounded-lg bg-surface-2 border border-white/[0.08] shadow-sm z-0',
                  activeIndicatorClassName
                )}
              />
            )}

            {/* Tab Label & Icon Content */}
            <span className="relative z-10 flex items-center gap-1.5">
              {Icon && <Icon className="w-3.5 h-3.5 flex-shrink-0" />}
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span
                  className={cn(
                    'px-1.5 py-0.2 rounded-full text-[9px] font-bold',
                    isActive ? 'bg-primary text-black' : 'bg-white/[0.08] text-zinc-400'
                  )}
                >
                  {tab.badge}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export const AnimatedTabContent: React.FC<{
  activeTab: string;
  tabId: string;
  children: React.ReactNode;
  className?: string;
}> = ({ activeTab, tabId, children, className = '' }) => {
  const prefersReducedMotion = useReducedMotion();
  if (activeTab !== tabId) return null;

  return (
    <motion.div
      key={tabId}
      initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  );
};
