'use client';

import React, { useState } from 'react';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  MoreVertical,
  Download,
  Edit2,
  ChevronDown,
  Layers,
  Sparkles,
  ArrowRight,
  Boxes,
} from 'lucide-react';
import { useWorkspace } from '../store/WorkspaceContext';
import { toast } from 'sonner';

interface SegmentPart {
  id: string;
  name: string;
  color: string;
  faces: number;
  vertices: number;
  volume: string;
  bounds: string;
  visible: boolean;
}

const DEFAULT_PARTS: SegmentPart[] = [
  { id: 'part-1', name: 'Part 1 - Head', color: '#22C55E', faces: 24832, vertices: 12641, volume: '0.042 m³', bounds: '0.28 × 0.32 × 0.31 m', visible: true },
  { id: 'part-2', name: 'Part 2 - Torso', color: '#3B82F6', faces: 62114, vertices: 31050, volume: '0.125 m³', bounds: '0.45 × 0.55 × 0.38 m', visible: true },
  { id: 'part-3', name: 'Part 3 - Left Arm', color: '#EF4444', faces: 28441, vertices: 14220, volume: '0.038 m³', bounds: '0.15 × 0.48 × 0.16 m', visible: true },
  { id: 'part-4', name: 'Part 4 - Right Arm', color: '#FACC15', faces: 28397, vertices: 14200, volume: '0.038 m³', bounds: '0.15 × 0.48 × 0.16 m', visible: true },
  { id: 'part-5', name: 'Part 5 - Waist', color: '#14B8A6', faces: 18221, vertices: 9110, volume: '0.045 m³', bounds: '0.35 × 0.22 × 0.30 m', visible: true },
  { id: 'part-6', name: 'Part 6 - Left Leg', color: '#A855F7', faces: 34118, vertices: 17050, volume: '0.065 m³', bounds: '0.18 × 0.72 × 0.20 m', visible: true },
  { id: 'part-7', name: 'Part 7 - Right Leg', color: '#F97316', faces: 33984, vertices: 16990, volume: '0.065 m³', bounds: '0.18 × 0.72 × 0.20 m', visible: true },
  { id: 'part-8', name: 'Part 8 - Accessories', color: '#EC4899', faces: 12124, vertices: 6060, volume: '0.015 m³', bounds: '0.20 × 0.25 × 0.15 m', visible: true },
];

export const SegmentInspector: React.FC = () => {
  const { currentAsset, activeTask, navigateToTool } = useWorkspace();
  const [parts, setParts] = useState<SegmentPart[]>(DEFAULT_PARTS);
  const [selectedPartId, setSelectedPartId] = useState<string>('part-1');
  const [isEditingName, setIsEditingName] = useState(false);
  const [customName, setCustomName] = useState('Head');

  const selectedPart = parts.find((p) => p.id === selectedPartId) || parts[0];

  const isSegmentRunning = activeTask?.type === 'segment' && activeTask.status === 'running';

  const toggleVisibility = (id: string) => {
    setParts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, visible: !p.visible } : p))
    );
  };

  const handleSelectAll = () => {
    setParts((prev) => prev.map((p) => ({ ...p, visible: true })));
    toast.info('All parts visible in 3D viewport');
  };

  const handleHideAll = () => {
    setParts((prev) => prev.map((p) => ({ ...p, visible: false })));
    toast.info('All parts hidden');
  };

  const handleSavePartName = () => {
    setParts((prev) =>
      prev.map((p) =>
        p.id === selectedPartId ? { ...p, name: `Part - ${customName}` } : p
      )
    );
    setIsEditingName(false);
  };

  return (
    <div id="inspector-segment" className="flex flex-col h-full bg-[hsl(var(--surface-1))] text-white overflow-y-auto scrollbar-thin select-none p-3 space-y-3.5">
      {/* Top Card: Segmentation Result */}
      <div className="rounded-xl bg-[hsl(var(--surface-0))] border border-white/[0.08] p-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-bold text-white">Segmentation Result</span>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
            {isSegmentRunning ? 'Processing' : 'Completed'}
          </span>
        </div>

        <div className="text-[10px] text-zinc-400">
          <span className="font-bold text-white">{parts.length} parts detected</span>
          <span className="mx-1.5">•</span>
          <span>PartField semantic classifier</span>
        </div>

        {/* Part List with eye visibility, colored dot, name, face count, and menu */}
        <div className="space-y-1 max-h-56 overflow-y-auto scrollbar-thin pr-1">
          {parts.map((p) => (
            <div
              key={p.id}
              onClick={() => {
                setSelectedPartId(p.id);
                setCustomName(p.name.replace(/Part \d+ - /, ''));
              }}
              className={`p-1.5 rounded-lg flex items-center justify-between gap-2 text-xs transition-all cursor-pointer ${
                selectedPartId === p.id
                  ? 'bg-[hsl(var(--surface-2))] border border-white/[0.12] text-white'
                  : 'hover:bg-white/[0.03] text-zinc-300'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleVisibility(p.id);
                  }}
                  className="text-zinc-400 hover:text-white p-0.5 rounded cursor-pointer"
                  title={p.visible ? 'Hide part' : 'Show part'}
                >
                  {p.visible ? (
                    <Eye className="w-3.5 h-3.5 text-primary" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5 text-zinc-600" />
                  )}
                </button>
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: p.color }}
                />
                <span className="truncate text-[11px] font-medium">{p.name}</span>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="text-[10px] font-mono text-zinc-400">
                  {p.faces.toLocaleString()} faces
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/[0.06]">
          <button
            type="button"
            onClick={handleSelectAll}
            className="py-1.5 px-2 rounded-lg bg-[hsl(var(--surface-2))] hover:bg-[hsl(var(--surface-3))] text-[11px] font-medium text-zinc-300 hover:text-white transition-colors cursor-pointer"
          >
            Show All
          </button>
          <button
            type="button"
            onClick={handleHideAll}
            className="py-1.5 px-2 rounded-lg bg-[hsl(var(--surface-2))] hover:bg-[hsl(var(--surface-3))] text-[11px] font-medium text-zinc-300 hover:text-white transition-colors cursor-pointer"
          >
            Hide All
          </button>
        </div>

        <button
          type="button"
          onClick={() => toast.success('Preparing segmented parts download archive...')}
          className="w-full py-2 px-3 rounded-xl bg-[hsl(var(--surface-2))] hover:bg-[hsl(var(--surface-3))] border border-white/[0.08] text-xs font-bold text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
        >
          <Download className="w-3.5 h-3.5 text-primary" />
          <span>Export Segments (GLB)</span>
        </button>
      </div>

      {/* Bottom Card: Part Information */}
      <div className="rounded-xl bg-[hsl(var(--surface-0))] border border-white/[0.08] p-3 space-y-2.5">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary" />
          <span className="text-xs font-bold text-white">Part Information</span>
        </div>

        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-zinc-400 text-[11px]">Name</span>
            <div className="flex items-center gap-1.5">
              {isEditingName ? (
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  onBlur={handleSavePartName}
                  onKeyDown={(e) => e.key === 'Enter' && handleSavePartName()}
                  autoFocus
                  className="w-24 px-1 py-0.5 rounded bg-black/40 border border-primary text-[11px] text-white font-bold"
                />
              ) : (
                <span className="font-bold text-white text-[11px]">{customName}</span>
              )}
              <button
                type="button"
                onClick={() => setIsEditingName(!isEditingName)}
                className="text-zinc-400 hover:text-white p-0.5 rounded cursor-pointer"
              >
                <Edit2 className="w-3 h-3" />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-zinc-400 text-[11px]">Faces</span>
            <span className="font-mono text-white font-bold">{selectedPart.faces.toLocaleString()}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-zinc-400 text-[11px]">Vertices</span>
            <span className="font-mono text-white font-bold">{selectedPart.vertices.toLocaleString()}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-zinc-400 text-[11px]">Volume</span>
            <span className="font-mono text-white font-bold">{selectedPart.volume}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-zinc-400 text-[11px]">Bounds</span>
            <span className="font-mono text-white font-bold text-[10px]">{selectedPart.bounds}</span>
          </div>
        </div>
      </div>

      {/* Chaining buttons */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => navigateToTool('uv')}
          className="w-full py-2.5 px-3 rounded-xl bg-[hsl(var(--surface-0))] hover:bg-[hsl(var(--surface-2))] border border-white/[0.08] text-white font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span>Unwrap Selected Parts (UV)</span>
          <ArrowRight className="w-3.5 h-3.5 text-zinc-400" />
        </button>

        <button
          type="button"
          onClick={() => navigateToTool('animation')}
          className="w-full py-2.5 px-3 rounded-xl bg-[hsl(var(--surface-0))] hover:bg-[hsl(var(--surface-2))] border border-white/[0.08] text-white font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
        >
          <Boxes className="w-3.5 h-3.5 text-primary" />
          <span>Use in Auto-Rigging</span>
          <ArrowRight className="w-3.5 h-3.5 text-zinc-400" />
        </button>
      </div>
    </div>
  );
};
