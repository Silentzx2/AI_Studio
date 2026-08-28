'use client';

import React from 'react';
import {
  Box,
  ChevronDown,
  ImageUp,
  Settings,
  CircleHelp,
  Globe2,
} from 'lucide-react';

interface WorldGenHeaderProps {
  onGenerate: () => void;
  onOpen: () => void;
}

export const WorldGenHeader: React.FC<WorldGenHeaderProps> = ({ onGenerate, onOpen }) => {
  return (
    <header className="h-14 w-full bg-[#0d0e12] border-b border-[#21242c] px-4 flex items-center justify-between z-30 select-none flex-shrink-0">
      {/* Left: brand + workspace token */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2 cursor-pointer group">
          <div className="w-6 h-6 rounded-md bg-[#f5c518] flex items-center justify-center shadow-md shadow-[#f5c518]/20 group-hover:scale-105 transition-transform">
            <Globe2 className="w-4 h-4 text-[#111216]" />
          </div>
          <span className="font-extrabold text-sm tracking-wider text-[#f3f4f6] uppercase font-mono">
            WORLDGEN
          </span>
        </div>

        <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#16181f] border border-[#272b36] text-xs font-semibold text-[#f5c518] hover:border-[#f5c518]/50 transition-colors">
          <Box className="w-3.5 h-3.5" />
          <span>New World</span>
          <ChevronDown className="w-3.5 h-3.5 text-[#9ca3af]" />
        </button>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onOpen}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#e5e7eb] bg-[#16181f] border border-[#272b36] hover:border-[#f5c518]/40 hover:text-[#f5c518] transition-colors"
        >
          <ImageUp className="w-3.5 h-3.5" />
          Open Environment
        </button>
        <button
          onClick={onGenerate}
          className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold text-[#111216] bg-[#f5c518] hover:brightness-110 active:scale-[0.98] transition-all shadow-md shadow-[#f5c518]/20"
        >
          Generate World
        </button>
        <span className="w-px h-6 bg-[#21242c] mx-1" />
        <button
          title="Settings"
          className="p-2 rounded-lg text-[var(--ws-text-muted,#8e95a5)] hover:text-[var(--ws-text,#f3f4f6)] hover:bg-[var(--ws-hover-bg,#181a20)] transition-colors"
        >
          <Settings className="w-4 h-4" />
        </button>
        <button
          title="Help"
          className="p-2 rounded-lg text-[var(--ws-text-muted,#8e95a5)] hover:text-[var(--ws-text,#f3f4f6)] hover:bg-[var(--ws-hover-bg,#181a20)] transition-colors"
        >
          <CircleHelp className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};

export default WorldGenHeader;
