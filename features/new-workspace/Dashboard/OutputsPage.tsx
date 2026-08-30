import React from 'react';
import { FolderOpen } from 'lucide-react';
import { useWorkspace } from '../store/WorkspaceContext';

export const OutputsPage: React.FC = () => {
  const { assets, setMainNav, setCurrentAsset } = useWorkspace();
  return (
    <div className="flex-1 overflow-y-auto bg-[hsl(var(--surface-0))] p-6 text-[hsl(var(--foreground))]">
      <div className="mx-auto max-w-7xl space-y-5">
        <div>
          <h1 className="text-2xl font-black">Outputs</h1>
          <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Real files reported by generation history.</p>
        </div>
        {assets.length === 0 ? (
          <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-12 text-center">
            <FolderOpen className="mx-auto mb-3 h-9 w-9 text-[hsl(var(--muted-foreground))]" />
            <div className="text-sm font-semibold text-[hsl(var(--muted-foreground))]">No outputs available</div>
            <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Run a real generation workflow to populate this page.</div>
            <button onClick={() => setMainNav('workspace')} className="mt-4 rounded-xl bg-[hsl(var(--primary))] px-4 py-2 text-xs font-bold text-[hsl(var(--surface-1))]">Open Workspace</button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
            {assets.map(asset => (
              <button key={asset.id} onClick={() => { setCurrentAsset(asset); setMainNav('workspace'); }} className="overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] text-left hover:border-[hsl(var(--primary))]/60">
                <div className="aspect-square bg-[hsl(var(--surface-1))]">
                  {asset.thumbnail ? <img src={asset.thumbnail} alt={asset.name} className="h-full w-full object-cover" crossOrigin="anonymous" /> : <div className="flex h-full items-center justify-center text-[hsl(var(--muted-foreground))]"><FolderOpen className="h-8 w-8" /></div>}
                </div>
                <div className="p-2.5"><div className="truncate text-[11px] font-semibold text-[hsl(var(--foreground))]">{asset.name}</div><div className="mt-1 text-[10px] uppercase text-[hsl(var(--muted-foreground))]">{asset.format}</div></div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
