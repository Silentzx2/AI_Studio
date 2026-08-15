"use client";

import React, { useState } from 'react';
import {
  Download, FileDown, Archive, CheckCircle2,
  AlertTriangle, Loader2, X
} from 'lucide-react';
import { useProjectStore } from '@/stores/useProjectStore';
import { useGenerationStore } from '@/stores/useGenerationStore';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  modelUrl?: string;
  modelName?: string;
}

export default function ExportDialog({ isOpen, onClose, modelUrl: modelUrlProp, modelName: modelNameProp }: ExportDialogProps) {
  const { currentProject } = useProjectStore();
  const { currentJob } = useGenerationStore();
  const [exporting, setExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<'glb' | 'zip'>('glb');

  if (!isOpen) return null;

  // Prefer an explicitly-selected asset (from the Asset Storage panel); fall
  // back to the active project / generation job for the legacy flows.
  const modelUrl = modelUrlProp || currentProject?.modelUrl || currentJob?.result?.downloadUrls?.glb;
  const modelName = modelNameProp || currentProject?.name || 'model';
  const hasModel = Boolean(modelUrl);
  const hasLayers = currentProject && currentProject.layers.length > 0;
  const enabledLayers = currentProject ? currentProject.layers.filter((l) => l.enabled) : [];

  const handleExportGLB = async () => {
    setExporting(true);
    try {
      const exportUrl = modelUrl;
      if (!exportUrl) {
        toast.error('No model available to export');
        return;
      }

      const response = await fetch('/api/v1/project/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelUrl: exportUrl,
          format: 'glb',
          layers: enabledLayers.map((l) => ({
            id: l.id,
            type: l.type,
            data: l.data,
            enabled: l.enabled,
          })),
          assembleAll: true,
        }),
      });

      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${modelName}.glb`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success('GLB exported successfully');
      onClose();
    } catch (err: any) {
      toast.error('Export failed: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  const handleExportZIP = async () => {
    setExporting(true);
    try {
      const exportUrl = modelUrl;
      if (!exportUrl) {
        toast.error('No model available to export');
        return;
      }

      const response = await fetch('/api/v1/project/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelUrl: exportUrl,
          format: 'zip',
          layers: enabledLayers.map((l) => ({
            id: l.id,
            type: l.type,
            data: l.data,
            enabled: l.enabled,
          })),
          includeOriginals: true,
        }),
      });

      if (!response.ok) throw new Error('ZIP export failed');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${modelName}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success('Project package exported successfully');
      onClose();
    } catch (err: any) {
      toast.error('ZIP export failed: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="bg-[hsl(var(--surface-0))] border border-white/5 rounded-3xl p-8 w-full max-w-lg shadow-[0_30px_100px_rgba(0,0,0,0.8)] relative z-10 overflow-hidden"
            id="export-dialog"
          >
            {/* Background Glow */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-amber-500/10 blur-[80px] rounded-full pointer-events-none" />
            <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-sky-500/10 blur-[80px] rounded-full pointer-events-none" />

            <div className="flex items-center justify-between mb-8">
              <div className="flex flex-col gap-1">
                <h3 className="text-lg font-black uppercase tracking-[-0.02em] text-white">
                  Export Protocol
                </h3>
                <p className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">Select Deployment Format</p>
              </div>
              <button
                onClick={onClose}
                className="w-10 h-10 flex items-center justify-center rounded-2xl bg-white/5 text-white/40 hover:text-white hover:bg-white/10 transition-all border border-white/5"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-col gap-4 mb-8">
              <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-6 hover:bg-white/[0.04] transition-all group">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
                    <FileDown size={16} className="text-amber-500" />
                  </div>
                  <span className="text-xs font-black uppercase tracking-widest text-white group-hover:text-amber-500 transition-colors">Assembled GLB</span>
                </div>
                <p className="text-[10px] text-white/40 leading-relaxed font-medium mb-5">
                  Unified orchestration of textures, materials, and rigging. Optimized for instant spatial deployment.
                </p>
                <Button
                  onClick={handleExportGLB}
                  disabled={exporting || !hasModel}
                  variant="premium"
                  className="w-full h-11"
                >
                  {exporting && exportFormat === 'glb' ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Download size={16} />
                  )}
                  Transmit GLB
                </Button>
              </div>

              <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-6 hover:bg-white/[0.04] transition-all group">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-xl bg-sky-500/10 flex items-center justify-center border border-sky-500/20">
                    <Archive size={16} className="text-sky-500" />
                  </div>
                  <span className="text-xs font-black uppercase tracking-widest text-white group-hover:text-sky-500 transition-colors">Project Archive (ZIP)</span>
                </div>
                <p className="text-[10px] text-white/40 leading-relaxed font-medium mb-5">
                  Complete asset extraction including high-fidelity maps and source rig data for external synthesis.
                </p>
                <Button
                  onClick={handleExportZIP}
                  disabled={exporting || !hasModel}
                  variant="outline"
                  className="w-full h-11 border-sky-500/20 hover:bg-sky-500/10 hover:border-sky-500/40 text-sky-400 font-black uppercase tracking-widest text-[10px] rounded-2xl"
                >
                  {exporting && exportFormat === 'zip' ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Archive size={16} />
                  )}
                  Compile ZIP Archive
                </Button>
              </div>
            </div>

            {hasLayers && (
              <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 mb-8">
                <span className="text-[9px] font-black uppercase tracking-[0.25em] text-white/30 mb-4 block">
                  Archive Composition
                </span>
                <div className="grid grid-cols-2 gap-3">
                  {enabledLayers.map((layer) => (
                    <div key={layer.id} className="flex items-center gap-2 p-2 rounded-xl bg-white/[0.02] border border-white/[0.03]">
                      <CheckCircle2 size={10} className="text-green-500/60" />
                      <span className="text-[9px] font-bold text-white/60 truncate">{layer.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!hasModel && (
              <div className="flex items-center gap-3 p-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl mb-8">
                <AlertTriangle size={16} className="text-amber-500" />
                <span className="text-[10px] font-bold text-amber-500/80 uppercase tracking-wider">
                  Synthesis Required: Generate model first
                </span>
              </div>
            )}

            <button
              onClick={onClose}
              className="w-full h-11 bg-white/5 border border-white/5 hover:bg-white/10 text-white/30 hover:text-white font-black uppercase tracking-[0.2em] rounded-2xl text-[10px] transition-all"
            >
              Abort Protocol
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}