import React, { useState } from 'react';
import { Download, X, FileBox, Check, Layers, Archive, Box, ShieldCheck, AlertTriangle, Loader2 } from 'lucide-react';
import { useWorkspace } from '../store/WorkspaceContext';

export const ExportModal: React.FC = () => {
  const { isExportModalOpen, setIsExportModalOpen, currentAsset } = useWorkspace();
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Variant & Format states
  const [variant, setVariant] = useState<'source' | 'game_ready' | 'lod_package'>('game_ready');
  const [exportFormat, setExportFormat] = useState<'glb' | 'obj' | 'stl' | 'ply'>('glb');
  const [targetPlatform, setTargetPlatform] = useState<'mobile' | 'low' | 'medium' | 'high' | 'cinematic'>('medium');

  // Packaging toggles
  const [packageZip, setPackageZip] = useState(false);
  const [includeLODs, setIncludeLODs] = useState(true);
  const [includeCollision, setIncludeCollision] = useState(true);
  const [includeQAReport, setIncludeQAReport] = useState(true);

  if (!isExportModalOpen) return null;
  if (!currentAsset?.source) return null;

  const sourceUrl = currentAsset.source.localUrl || currentAsset.source.viewUrl;
  const qaScore = currentAsset.qaScore ?? (currentAsset.artifacts?.qaReport as any)?.game_ready_score;
  const qaStatus = currentAsset.qaStatus ?? (currentAsset.artifacts?.qaReport as any)?.status;
  const qaWarnings = currentAsset.qaWarnings ?? (currentAsset.artifacts?.qaReport as any)?.warnings ?? [];

  const handleExport = async () => {
    if (!sourceUrl) {
      setError('No source URL available for this model.');
      return;
    }

    setIsExporting(true);
    setError(null);

    try {
      const response = await fetch('/api/v1/project/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelUrl: sourceUrl,
          assetName: currentAsset.name,
          format: exportFormat,
          variant,
          targetPlatform,
          packageZip,
          includeLODs: packageZip && includeLODs,
          includeCollision: packageZip && includeCollision,
          includeQAReport: packageZip && includeQAReport,
          includeOriginals: true,
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.detail || errJson.message || `Export failed with HTTP ${response.status}`);
      }

      // Read filename from Content-Disposition header if available
      const disposition = response.headers.get('content-disposition');
      let filename = `${currentAsset.name}_export.${packageZip ? 'zip' : exportFormat}`;
      if (disposition && disposition.includes('filename=')) {
        const matches = disposition.match(/filename="?([^";]+)"?/);
        if (matches && matches[1]) {
          filename = matches[1];
        }
      }

      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);

      setIsExportModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 text-xs select-none">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/[0.08] bg-[#181a20] shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] bg-[#1e2026] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F9CF00]/15 text-[#F9CF00] border border-[#F9CF00]/30">
              <FileBox className="h-5 w-5 stroke-[2.2]" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Production Export Engine</h2>
              <p className="text-[11px] text-zinc-400 truncate max-w-[280px]">{currentAsset.name}</p>
            </div>
          </div>
          <button
            onClick={() => setIsExportModalOpen(false)}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/[0.08] hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5 max-h-[75vh] overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700">
          {/* QA Quality Score Banner */}
          {qaScore !== undefined && (
            <div className={`p-3 rounded-xl border flex items-center justify-between ${
              qaScore >= 80
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : qaScore >= 50
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#00FF9D]" />
                <div>
                  <div className="font-bold text-xs flex items-center gap-1.5">
                    <span>Quality Score: {qaScore}/100</span>
                    <span className="text-[9px] uppercase px-1.5 py-0.2 rounded font-mono font-bold bg-black/30">
                      {qaStatus || (qaScore >= 80 ? 'PASS' : 'WARN')}
                    </span>
                  </div>
                  <div className="text-[10px] opacity-80">
                    {qaWarnings.length > 0 ? qaWarnings[0] : 'Asset validated for game engine compliance'}
                  </div>
                </div>
              </div>
              <span className="text-[10px] font-mono font-bold">
                {currentAsset.faces?.toLocaleString() ?? 0} tris
              </span>
            </div>
          )}

          {/* Section 1: Asset Variant */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Asset Variant</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'game_ready', label: 'Game-Ready', tip: 'Optimized budget' },
                { id: 'source', label: 'Source Master', tip: 'Uncompressed raw' },
                { id: 'lod_package', label: 'LOD Package', tip: 'LOD0–LOD3 cascade' },
              ].map(v => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setVariant(v.id as any)}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    variant === v.id
                      ? 'border-[#F9CF00] bg-[#2b2f3a] text-white shadow-sm'
                      : 'border-white/[0.08] bg-[#1e2026] text-zinc-300 hover:border-white/[0.16]'
                  }`}
                >
                  <span className={`block text-xs font-bold ${variant === v.id ? 'text-[#F9CF00]' : 'text-zinc-200'}`}>
                    {v.label}
                  </span>
                  <span className="block text-[9px] text-zinc-400 mt-0.5">{v.tip}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Target Platform Budget (when Game-Ready is active) */}
          {variant === 'game_ready' && (
            <div className="space-y-1.5 p-3 rounded-xl bg-black/20 border border-white/[0.06]">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Optimization Target</span>
              <div className="grid grid-cols-5 gap-1.5">
                {[
                  { id: 'mobile', label: 'Mobile', desc: '~18k' },
                  { id: 'low', label: 'Low', desc: '~28k' },
                  { id: 'medium', label: 'Medium', desc: '~45k' },
                  { id: 'high', label: 'High', desc: '~85k' },
                  { id: 'cinematic', label: 'Cine', desc: '~180k' },
                ].map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setTargetPlatform(p.id as any)}
                    className={`py-1.5 px-1 rounded-lg text-center transition-all cursor-pointer ${
                      targetPlatform === p.id
                        ? 'bg-[#00FF9D] text-black font-bold'
                        : 'bg-[#1e2026] text-zinc-300 hover:bg-white/[0.06] border border-white/[0.06]'
                    }`}
                  >
                    <span className="block text-[10px]">{p.label}</span>
                    <span className="block text-[8px] opacity-75">{p.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Section 2: Format Selector */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Target Format</label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { id: 'glb', label: 'GLB / glTF', tip: 'PBR Materials' },
                { id: 'obj', label: 'OBJ', tip: 'Wavefront' },
                { id: 'stl', label: 'STL', tip: '3D Printing' },
                { id: 'ply', label: 'PLY', tip: 'Polygon Mesh' },
              ].map(fmt => (
                <button
                  key={fmt.id}
                  type="button"
                  onClick={() => setExportFormat(fmt.id as any)}
                  className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
                    exportFormat === fmt.id
                      ? 'border-[#F9CF00] bg-[#2b2f3a] text-[#F9CF00] font-bold'
                      : 'border-white/[0.08] bg-[#1e2026] text-zinc-300 hover:border-white/[0.16]'
                  }`}
                >
                  <span className="block text-xs">{fmt.label}</span>
                  <span className="block text-[8px] text-zinc-400 mt-0.5">{fmt.tip}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Section 3: Packaging Options */}
          <div className="space-y-2 p-3.5 rounded-xl border border-white/[0.08] bg-[#1e2026]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Archive className="w-4 h-4 text-[#F9CF00]" />
                <div>
                  <span className="text-zinc-200 font-bold block text-xs">Structured ZIP Package</span>
                  <span className="text-[10px] text-zinc-400">Bundles source, variants, LODs, collision, and QA report</span>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={packageZip}
                onClick={() => setPackageZip(prev => !prev)}
                className={`w-8 h-4 rounded-full p-0.5 transition-colors relative cursor-pointer ${
                  packageZip ? 'bg-[#F9CF00]' : 'bg-[#25262A]'
                }`}
              >
                <div className={`w-3 h-3 rounded-full bg-black transition-transform ${
                  packageZip ? 'translate-x-4' : 'translate-x-0'
                }`} />
              </button>
            </div>

            {packageZip && (
              <div className="pt-2.5 border-t border-white/[0.06] space-y-2 text-xs">
                <label className="flex items-center justify-between text-zinc-300 cursor-pointer">
                  <span>Include LODs (LOD0–LOD3)</span>
                  <input
                    type="checkbox"
                    checked={includeLODs}
                    onChange={e => setIncludeLODs(e.target.checked)}
                    className="rounded accent-[#F9CF00]"
                  />
                </label>
                <label className="flex items-center justify-between text-zinc-300 cursor-pointer">
                  <span>Include Physics Collision Mesh</span>
                  <input
                    type="checkbox"
                    checked={includeCollision}
                    onChange={e => setIncludeCollision(e.target.checked)}
                    className="rounded accent-[#F9CF00]"
                  />
                </label>
                <label className="flex items-center justify-between text-zinc-300 cursor-pointer">
                  <span>Include QA Validation Report (JSON)</span>
                  <input
                    type="checkbox"
                    checked={includeQAReport}
                    onChange={e => setIncludeQAReport(e.target.checked)}
                    className="rounded accent-[#F9CF00]"
                  />
                </label>
              </div>
            )}
          </div>

          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-white/[0.08] bg-[#1e2026] px-5 py-4">
          <span className="text-[10px] text-zinc-500 font-mono">
            {packageZip ? 'ZIP Archive' : `${exportFormat.toUpperCase()} Single Asset`}
          </span>
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setIsExportModalOpen(false)}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-zinc-300 hover:bg-white/[0.08] hover:text-white transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={() => void handleExport()}
              disabled={isExporting}
              className="flex items-center gap-2 rounded-xl bg-[#F9CF00] hover:bg-[#ffe033] px-6 py-2 text-xs font-bold text-black shadow-lg shadow-[#F9CF00]/20 disabled:opacity-50 transition-all cursor-pointer"
            >
              {isExporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Packaging…</span>
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 stroke-[2.5]" />
                  <span>Export {packageZip ? 'Package (ZIP)' : exportFormat.toUpperCase()}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
