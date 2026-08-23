import React from 'react';
import { FolderOpen } from 'lucide-react';
import { useWorkspace } from '../store/WorkspaceContext';

export const OutputsPage: React.FC = () => {
  const { assets, setMainNav, setCurrentAsset } = useWorkspace();
  return (
    <div className="flex-1 overflow-y-auto bg-[#0d0e12] p-6 text-[#f3f4f6]">
      <div className="mx-auto max-w-7xl space-y-5">
        <div>
          <h1 className="text-2xl font-black">Outputs</h1>
          <p className="mt-1 text-xs text-[#8e95a5]">Real files reported by generation history.</p>
        </div>
        {assets.length === 0 ? (
          <div className="rounded-2xl border border-[#242834] bg-[#14161c] p-12 text-center">
            <FolderOpen className="mx-auto mb-3 h-9 w-9 text-[#3d4350]" />
            <div className="text-sm font-semibold text-[#9ca3af]">No outputs available</div>
            <div className="mt-1 text-xs text-[#626977]">Run a real generation workflow to populate this page.</div>
            <button onClick={() => setMainNav('workspace')} className="mt-4 rounded-xl bg-[#f5c518] px-4 py-2 text-xs font-bold text-[#111216]">Open Workspace</button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
            {assets.map(asset => (
              <button key={asset.id} onClick={() => { setCurrentAsset(asset); setMainNav('workspace'); }} className="overflow-hidden rounded-2xl border border-[#242834] bg-[#14161c] text-left hover:border-[#f5c518]/60">
                <div className="aspect-square bg-[#0b0c0f]">
                  {asset.thumbnail ? <img src={asset.thumbnail} alt={asset.name} className="h-full w-full object-cover" crossOrigin="anonymous" /> : <div className="flex h-full items-center justify-center text-[#414754]"><FolderOpen className="h-8 w-8" /></div>}
                </div>
                <div className="p-2.5"><div className="truncate text-[11px] font-semibold text-[#e5e7eb]">{asset.name}</div><div className="mt-1 text-[10px] uppercase text-[#707786]">{asset.format}</div></div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
