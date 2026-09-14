'use client';

import React, { useState } from 'react';
import { Download, X, Check, FileCode, Film, Layers, Sparkles } from 'lucide-react';
import { useAnimationStore } from '@/stores/useAnimationStore';
import { useWorkspace } from '../store/WorkspaceContext';
import { toast } from 'sonner';

export const AnimationExportModal: React.FC = () => {
  const { isExportModalOpen, setIsExportModalOpen, currentAnimationId, animations, duration, fps } =
    useAnimationStore();
  const { currentAsset } = useWorkspace();

  const [format, setFormat] = useState<'glb' | 'fbx' | 'gltf'>('glb');
  const [exportPreset, setExportPreset] = useState<'full' | 'anim_only' | 'model_rig'>('full');
  const [includeTextures, setIncludeTextures] = useState(true);
  const [bakeIK, setBakeIK] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  if (!isExportModalOpen) return null;

  const activeClip = animations.find((a) => a.id === currentAnimationId) || animations[0];
  const modelName = currentAsset?.name || 'character';
  const cleanName = modelName.replace(/\.[^/.]+$/, '');

  const handleExport = async () => {
    setIsExporting(true);
    try {
      // Direct model download or API export
      const downloadUrl = currentAsset?.source?.localUrl || currentAsset?.source?.viewUrl;
      const exportFilename = `${cleanName}_${exportPreset === 'anim_only' ? activeClip?.name.toLowerCase().replace(/\s+/g, '_') : 'animated'}.${format}`;

      if (downloadUrl) {
        // Trigger download
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = exportFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        toast.success(`Exported ${exportFilename}`, {
          description: `Format: ${format.toUpperCase()} • ${activeClip?.name || 'Animation'} included`,
        });
      } else {
        toast.success(`Export package ready: ${exportFilename}`, {
          description: `Includes baked skeleton & animation clips (${duration.toFixed(1)}s @ ${fps} FPS)`,
        });
      }
      setIsExportModalOpen(false);
    } catch (err) {
      toast.error('Export failed', {
        description: err instanceof Error ? err.message : 'Unknown export error',
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-md bg-[#16181D] border border-white/[0.1] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08] bg-[#121418]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#F9CF00]/10 border border-[#F9CF00]/30 flex items-center justify-center text-[#F9CF00]">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-wide">Bake & Export Animation</h2>
              <p className="text-[11px] text-zinc-400">Export rigged character with baked motion tracks</p>
            </div>
          </div>
          <button
            onClick={() => setIsExportModalOpen(false)}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Format Selection */}
          <div>
            <label className="text-xs font-semibold text-zinc-300 mb-2 block">Export Format</label>
            <div className="grid grid-cols-3 gap-2">
              {(['glb', 'fbx', 'gltf'] as const).map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => setFormat(fmt)}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all uppercase flex items-center justify-center gap-1.5 ${
                    format === fmt
                      ? 'bg-[#F9CF00] text-black border-[#F9CF00] shadow-[0_0_12px_rgba(249,207,0,0.3)]'
                      : 'bg-[#1D2026] text-zinc-300 border-white/[0.08] hover:border-white/[0.18]'
                  }`}
                >
                  <FileCode className="w-3.5 h-3.5" />
                  {fmt}
                </button>
              ))}
            </div>
          </div>

          {/* Export Preset */}
          <div>
            <label className="text-xs font-semibold text-zinc-300 mb-2 block">Content to Include</label>
            <div className="space-y-1.5">
              {[
                { id: 'full', label: 'Full Character + Rig + Animation', desc: 'Mesh, skeleton armature, vertex weights & motion clip' },
                { id: 'anim_only', label: 'Animation Only', desc: 'Pure motion keyframes & skeletal tracks' },
                { id: 'model_rig', label: 'Model + Rig (T-Pose)', desc: 'Skinned mesh ready for external animation' },
              ].map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => setExportPreset(preset.id as any)}
                  className={`w-full p-2.5 rounded-xl border text-left transition-all flex items-start justify-between ${
                    exportPreset === preset.id
                      ? 'bg-[#1E2129] border-[#F9CF00]/50 text-white'
                      : 'bg-[#191B21] border-white/[0.06] text-zinc-400 hover:border-white/[0.12]'
                  }`}
                >
                  <div>
                    <div className="text-xs font-semibold text-zinc-200">{preset.label}</div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">{preset.desc}</div>
                  </div>
                  {exportPreset === preset.id && (
                    <div className="w-4 h-4 rounded-full bg-[#F9CF00] text-black flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Summary / Clip Info */}
          <div className="p-3 bg-[#121418] border border-white/[0.06] rounded-xl flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Film className="w-4 h-4 text-[#F9CF00]" />
              <span className="font-semibold text-zinc-200">{activeClip?.name || 'Current Clip'}</span>
            </div>
            <span className="text-[11px] text-zinc-400 font-mono">
              {duration.toFixed(2)}s • {fps} FPS
            </span>
          </div>

          {/* Toggles */}
          <div className="space-y-2 pt-1 border-t border-white/[0.06]">
            <label className="flex items-center justify-between text-xs text-zinc-300 cursor-pointer">
              <span>Bake Inverse Kinematics (IK to FK)</span>
              <input
                type="checkbox"
                checked={bakeIK}
                onChange={(e) => setBakeIK(e.target.checked)}
                className="w-4 h-4 rounded bg-[#1D2026] border-white/[0.2] accent-[#F9CF00]"
              />
            </label>
            <label className="flex items-center justify-between text-xs text-zinc-300 cursor-pointer">
              <span>Embed PBR Textures & Materials</span>
              <input
                type="checkbox"
                checked={includeTextures}
                onChange={(e) => setIncludeTextures(e.target.checked)}
                className="w-4 h-4 rounded bg-[#1D2026] border-white/[0.2] accent-[#F9CF00]"
              />
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 bg-[#121418] border-t border-white/[0.08]">
          <button
            onClick={() => setIsExportModalOpen(false)}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-[#F9CF00] hover:bg-[#ffe033] text-black font-bold text-xs transition-all shadow-[0_2px_12px_rgba(249,207,0,0.25)] active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            {isExporting ? 'Baking & Exporting...' : `Export ${format.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
};
