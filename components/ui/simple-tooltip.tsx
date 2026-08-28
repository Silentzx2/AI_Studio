'use client';

import * as React from 'react';

interface SimpleTooltipProps {
  label: string;
  children: React.ReactNode;
  side?: 'top' | 'bottom';
}

export const SimpleTooltip: React.FC<SimpleTooltipProps> = ({ label, children, side = 'top' }) => {
  return (
    <div className="relative inline-flex group">
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-50 whitespace-nowrap px-2.5 py-1.5 text-[10px] font-medium text-white bg-[#1a1d26] border border-[#2e3342] rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-150 ${
          side === 'top'
            ? 'bottom-full left-1/2 -translate-x-1/2 mb-2'
            : 'top-full left-1/2 -translate-x-1/2 mt-2'
        }`}
      >
        {label}
      </span>
    </div>
  );
};
