import React, { useState } from 'react';
import { Download, X, FileBox, Printer, Check, Layers } from 'lucide-react';
import { useWorkspace } from '../store/WorkspaceContext';

export const ExportModal: React.FC = () => {
  const { isExportModalOpen, setIsExportModalOpen, currentAsset } = useWorkspace();
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState<'original' | 'glb' | 'stl'>('original');

  if (!isExportModalOpen) return null;
  if (!currentAsset?.source) return null;

  const handleDownload = async () => {
    setIsExporting(true);
    setError(null);
    try {
      const sourceUrl = currentAsset.source!.localUrl || currentAsset.source!.viewUrl;
      if (!sourceUrl) throw new Error('No source is available for this output.');
      let downloadUrl = sourceUrl;
      let revoke = false;
      if (!currentAsset.source!.localUrl) {
        const response = await fetch(sourceUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        downloadUrl = URL.createObjectURL(await response.blob());
        revoke = true;
      }
      const link = document.createElement('a');
      link.href = downloadUrl;
      const ext = exportFormat === 'stl' ? '.stl' : exportFormat === 'glb' ? '.glb' : '';
      link.download = currentAsset.name.endsWith(ext) || ext === '' ? currentAsset.name : `${currentAsset.name}${ext}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      if (revoke) URL.revokeObjectURL(downloadUrl);
      setIsExportModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed.');
    } finally {
      setIsExporting(false);
    }
  };

  const format = currentAsset.format === 'FILE' ? 'Original file' : currentAsset.format;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 text-xs select-none">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-[#2f333e] bg-[#181a20] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#2f333e] bg-[#1e2026] p-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F9CF00]/15 text-[#F9CF00] border border-[#F9CF00]/30">
              <FileBox className="h-5 w-5 stroke-[2.2]" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Export 3D Model</h2>
              <p className="text-[11px] text-zinc-400">{currentAsset.name}</p>
            </div>
          </div>
          <button 
            onClick={() => setIsExportModalOpen(false)} 
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-[#282b34] hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {/* Format Selector */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider">Export Format</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setExportFormat('original')}
                className={`p-2.5 rounded-xl border text-center transition-all ${
                  exportFormat === 'original'
                    ? 'border-[#F9CF00] bg-[#2b2f3a] text-[#F9CF00] font-bold'
                    : 'border-[#2f333e] bg-[#1e2026] text-zinc-300 hover:border-[#3d4252]'
                }`}
              >
                <span className="block text-xs">Original</span>
                <span className="block text-[9px] text-zinc-400 mt-0.5">{format}</span>
              </button>
              <button
                type="button"
                onClick={() => setExportFormat('glb')}
                className={`p-2.5 rounded-xl border text-center transition-all ${
                  exportFormat === 'glb'
                    ? 'border-[#F9CF00] bg-[#2b2f3a] text-[#F9CF00] font-bold'
                    : 'border-[#2f333e] bg-[#1e2026] text-zinc-300 hover:border-[#3d4252]'
                }`}
              >
                <span className="block text-xs">GLB / GLTF</span>
                <span className="block text-[9px] text-zinc-400 mt-0.5">Textures Included</span>
              </button>
              <button
                type="button"
                onClick={() => setExportFormat('stl')}
                className={`p-2.5 rounded-xl border text-center transition-all ${
                  exportFormat === 'stl'
                    ? 'border-[#F9CF00] bg-[#2b2f3a] text-[#F9CF00] font-bold'
                    : 'border-[#2f333e] bg-[#1e2026] text-zinc-300 hover:border-[#3d4252]'
                }`}
              >
                <span className="block text-xs">STL Print</span>
                <span className="block text-[9px] text-zinc-400 mt-0.5">3D Printing</span>
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-[#2f333e] bg-[#1e2026] p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Model File</span>
              <span className="max-w-[200px] truncate font-mono text-white font-semibold">{currentAsset.source.filename}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Topology & Geometry</span>
              <span className="text-[#00FF9D] font-mono font-semibold">
                {currentAsset.statsAvailable ? `${currentAsset.faces.toLocaleString()} faces · ${currentAsset.vertices.toLocaleString()} verts` : 'Real-time computed'}
              </span>
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-rose-300">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2.5 border-t border-[#2f333e] bg-[#1e2026] p-4">
          <button 
            onClick={() => setIsExportModalOpen(false)} 
            className="rounded-xl px-4 py-2 text-xs font-semibold text-zinc-300 hover:bg-[#282b34] hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={() => void handleDownload()} 
            disabled={isExporting} 
            className="flex items-center gap-2 rounded-xl bg-[#F9CF00] hover:bg-[#ffe033] px-6 py-2 text-xs font-bold text-black shadow-lg shadow-[#F9CF00]/20 disabled:opacity-50 transition-all cursor-pointer"
          >
            <Download className="h-4 w-4 stroke-[2.5]" />
            {isExporting ? 'Exporting…' : 'Export Asset'}
          </button>
        </div>
      </div>
    </div>
  );
};
