"use client";

import React, { useState } from 'react';
import {
  Download, FileDown, Archive, CheckCircle2,
  AlertTriangle, Loader2,
} from 'lucide-react';
import { useProjectStore } from '@/stores/useProjectStore';
import { useGenerationStore } from '@/stores/useGenerationStore';
import { toast } from 'sonner';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" id="export-dialog-overlay">
      <div className="bg-[hsl(var(--surface-0))] border border-[hsl(var(--border))] rounded-2xl p-6 w-full max-w-md shadow-2xl" id="export-dialog">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-black uppercase tracking-wider text-[hsl(var(--foreground))]">
            Export Project
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[hsl(var(--surface-2))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
          >
            <Download size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-3 mb-4">
          <div className="bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <FileDown size={14} className="text-[hsl(var(--primary))]" />
              <span className="text-xs font-bold text-[hsl(var(--foreground))]">Assembled GLB</span>
            </div>
            <p className="text-[10px] text-[hsl(var(--muted-foreground))] leading-relaxed">
              Generates a single GLB file with all enabled modifications (textures, materials, rigging, animations, LODs) embedded. Ready for deployment.
            </p>
            <button
              onClick={handleExportGLB}
              disabled={exporting || !hasModel}
              className="mt-3 w-full bg-[hsl(var(--primary))] hover:brightness-110 active:scale-[0.98] disabled:opacity-40 text-[hsl(var(--surface-0))] font-extrabold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 transition-all"
            >
              {exporting && exportFormat === 'glb' ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <FileDown size={14} />
              )}
              Export GLB
            </button>
          </div>

          <div className="bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Archive size={14} className="text-[hsl(var(--neon-amber))]" />
              <span className="text-xs font-bold text-[hsl(var(--foreground))]">Project Package (ZIP)</span>
            </div>
            <p className="text-[10px] text-[hsl(var(--muted-foreground))] leading-relaxed">
              Packages the assembled GLB plus all original assets separately (textures, PBR maps, animation files, rig data, metadata) for manual editing or reuse.
            </p>
            <button
              onClick={handleExportZIP}
              disabled={exporting || !hasModel}
              className="mt-3 w-full bg-[hsl(var(--neon-amber))] hover:brightness-110 active:scale-[0.98] disabled:opacity-40 text-[hsl(var(--surface-0))] font-extrabold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 transition-all"
            >
              {exporting && exportFormat === 'zip' ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Archive size={14} />
              )}
              Export Project Package
            </button>
          </div>
        </div>

        {hasLayers && (
          <div className="bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] rounded-xl p-3 mb-4">
            <span className="text-[9px] font-black uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
              Layers in Export
            </span>
            <div className="flex flex-col gap-1 mt-2">
              {enabledLayers.map((layer) => (
                <div key={layer.id} className="flex items-center gap-2 text-[10px] text-[hsl(var(--foreground))]">
                  <CheckCircle2 size={10} className="text-[hsl(var(--neon-green))]" />
                  <span className="font-semibold">{layer.name}</span>
                  <span className="text-[hsl(var(--muted-foreground))] ml-auto font-mono">{layer.type}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {!hasModel && (
          <div className="flex items-center gap-2 p-3 bg-[hsl(var(--surface-1))] border border-[hsl(var(--neon-amber)/0.3)] rounded-xl mb-4">
            <AlertTriangle size={14} className="text-[hsl(var(--neon-amber))]" />
            <span className="text-[10px] text-[hsl(var(--neon-amber))]">
              Generate or load a model before exporting
            </span>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]/50 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] font-bold py-2.5 rounded-xl text-xs transition-all"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}