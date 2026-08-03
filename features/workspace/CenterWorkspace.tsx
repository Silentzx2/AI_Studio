'use client';

import { ReactNode } from 'react';

export function CenterWorkspace({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="relative flex flex-col w-full h-full min-h-0 bg-surface-0/50 overflow-hidden rounded-lg">
      {/* REMOVED: 4 stacked absolute glow/shadow/gradient divs — each forced extra compositing */}
      <div className="relative z-10 flex flex-col w-full h-full min-h-0">
        {children}
      </div>
    </div>
  );
}