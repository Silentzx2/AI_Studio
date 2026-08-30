import React, { useState } from 'react';
import { Download, X, FileBox } from 'lucide-react';
import { useWorkspace } from '../store/WorkspaceContext';

export const ExportModal: React.FC = () => {
  const { isExportModalOpen, setIsExportModalOpen, currentAsset } = useWorkspace();
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      link.download = currentAsset.name;
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[hsl(var(--surface-1))] p-4 text-xs">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-[hsl(var(--surface-2))] bg-[hsl(var(--surface-1))] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[hsl(var(--border))] p-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(var(--primary))]/15 text-[hsl(var(--primary))]"><FileBox className="h-4 w-4" /></div>
            <div>
              <h2 className="text-sm font-bold text-[hsl(var(--foreground))]">Download Output</h2>
              <p className="text-[11px] text-[hsl(var(--muted-foreground))]">{currentAsset.name}</p>
            </div>
          </div>
          <button onClick={() => setIsExportModalOpen(false)} className="rounded-lg p-1.5 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))]"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-4 p-5">
          <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-3">
            <div className="flex items-center justify-between"><span className="text-[hsl(var(--muted-foreground))]">Format</span><span className="font-mono text-[hsl(var(--foreground))]">{format}</span></div>
            <div className="mt-2 flex items-center justify-between"><span className="text-[hsl(var(--muted-foreground))]">Source</span><span className="max-w-[220px] truncate font-mono text-[hsl(var(--foreground))]">{currentAsset.source.filename}</span></div>
            <div className="mt-2 flex items-center justify-between"><span className="text-[hsl(var(--muted-foreground))]">Geometry stats</span><span className="text-[hsl(var(--foreground))]">{currentAsset.statsAvailable ? `${currentAsset.faces.toLocaleString()} faces · ${currentAsset.vertices.toLocaleString()} verts` : 'Unavailable'}</span></div>
          </div>

          <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-3 text-[hsl(var(--muted-foreground))]">
            Downloads the actual generation output file. Format conversion, compression and texture baking are performed by the workflow/node that created the output, not by this download action.
          </div>

          {error && <div className="rounded-xl border border-[hsl(var(--destructive))]/30 bg-[hsl(var(--surface-1))] p-3 text-[hsl(var(--destructive))]">{error}</div>}
        </div>

        <div className="flex justify-end gap-2.5 border-t border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-4">
          <button onClick={() => setIsExportModalOpen(false)} className="rounded-xl px-4 py-2 text-xs font-semibold text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-1))] hover:text-[hsl(var(--foreground))]">Cancel</button>
          <button onClick={() => void handleDownload()} disabled={isExporting} className="flex items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-6 py-2 text-xs font-bold text-[hsl(var(--surface-1))] shadow-lg shadow-[hsl(var(--primary))]/15 disabled:opacity-50">
            <Download className="h-4 w-4" />
            {isExporting ? 'Downloading…' : 'Download Original'}
          </button>
        </div>
      </div>
    </div>
  );
};
