import React, { useState, useEffect } from 'react';
import { 
  Cable, 
  X, 
  Check, 
  Copy, 
  Box, 
  CheckCircle2
} from 'lucide-react';
import { useWorkspace } from '../store/WorkspaceContext';

export const DccBridgeModal: React.FC = () => {
  const { isDccBridgeOpen, setIsDccBridgeOpen } = useWorkspace();
  const [copiedApp, setCopiedApp] = useState<string | null>(null);

  useEffect(() => {
    if (!isDccBridgeOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsDccBridgeOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isDccBridgeOpen, setIsDccBridgeOpen]);

  if (!isDccBridgeOpen) return null;

  const handleCopyScript = (app: string, script: string) => {
    const fallbackCopy = (text: string) => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    };
    try {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(script).catch(() => fallbackCopy(script));
      } else {
        fallbackCopy(script);
      }
    } catch {
      fallbackCopy(script);
    }
    setCopiedApp(app);
    setTimeout(() => setCopiedApp(null), 2000);
  };

  const bridges = [
    {
      id: 'blender',
      name: 'Blender 3.6 / 4.x Addon',
      port: '9871',
      status: 'Live Sync Active',
      script: `import bpy, requests\n# Forge3D live sync plugin\nHOST = "http://localhost:9871"\ndef sync_model():\n    bpy.ops.import_scene.gltf(filepath="synced_forge3d_model.glb")\nsync_model()`
    },
    {
      id: 'unreal',
      name: 'Unreal Engine 5.3 / 5.4 Live Link',
      port: '9872',
      status: 'Port Listening',
      script: `// Unreal Engine 5 Python Editor Sync\nimport unreal\ngltf_factory = unreal.FbxFactory()\n# Auto-import mesh & material into /Game/Forge3D/`
    },
    {
      id: 'maya',
      name: 'Autodesk Maya 2024 Connector',
      port: '9873',
      status: 'Ready',
      script: `import maya.cmds as cmds\n# Maya Forge3D bridge listener\ncmds.file("forge3d_asset.fbx", i=True)`
    }
  ];

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) setIsDccBridgeOpen(false); }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 select-none animate-in fade-in duration-200"
    >
      <div className="w-full max-w-xl rounded-2xl bg-[#181a20] border border-white/[0.08] shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-[#1e2026] border-b border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#F9CF00]/15 border border-[#F9CF00]/30 flex items-center justify-center text-[#F9CF00]">
              <Cable className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">DCC Bridge & Live Sync</h3>
              <p className="text-[11px] text-zinc-400">Send 3D meshes & PBR textures directly into DCC software</p>
            </div>
          </div>
          <button
            onClick={() => setIsDccBridgeOpen(false)}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-3 text-xs bg-[#141518]">
          {bridges.map((b) => (
            <div key={b.id} className="p-3.5 rounded-xl bg-[#1e2026] border border-white/[0.08] space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Box className="w-4 h-4 text-[#F9CF00]" />
                  <span className="font-bold text-xs text-white">{b.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#141518] text-[#00E5FF] border border-white/[0.06]">Port {b.port}</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    {b.status}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-zinc-400">One-click Python Listener Script:</span>
                <button
                  onClick={() => handleCopyScript(b.id, b.script)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#25262A] hover:bg-[#2d2f34] text-zinc-200 hover:text-white border border-white/[0.08] transition-all cursor-pointer font-medium active:scale-95"
                >
                  {copiedApp === b.id ? <Check className="w-3.5 h-3.5 text-[#00FF9D]" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedApp === b.id ? 'Copied' : 'Copy Script'}</span>
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-5 py-3.5 bg-[#1e2026] border-t border-white/[0.08]">
          <button
            onClick={() => setIsDccBridgeOpen(false)}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#FFE24C] to-[#F9CF00] hover:brightness-105 active:scale-95 text-black font-extrabold text-xs shadow-md shadow-[#F9CF00]/20 transition-all cursor-pointer border border-white/20"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
