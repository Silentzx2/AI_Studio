import React, { useState } from 'react';
import { 
  Cable, 
  X, 
  Check, 
  Copy, 
  ExternalLink, 
  Box, 
  Layers, 
  CheckCircle2
} from 'lucide-react';
import { useWorkspace } from '../store/WorkspaceContext';

export const DccBridgeModal: React.FC = () => {
  const { isDccBridgeOpen, setIsDccBridgeOpen } = useWorkspace();
  const [copiedApp, setCopiedApp] = useState<string | null>(null);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 select-none animate-in fade-in duration-200">
      <div className="w-full max-w-xl rounded-2xl bg-[#14161c] border border-[#2e3342] shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-[#181b22] border-b border-[#292e3c]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#202532] border border-[#32394a] flex items-center justify-center text-[#f5c518]">
              <Cable className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-[#f3f4f6]">DCC Bridge & Live Sync</h3>
              <p className="text-[11px] text-[#8e95a5]">Send 3D meshes & PBR textures directly into DCC software</p>
            </div>
          </div>
          <button
            onClick={() => setIsDccBridgeOpen(false)}
            className="p-1.5 rounded-lg text-[#9ca3af] hover:text-[#f3f4f6] hover:bg-[#252936]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-3.5 text-xs">
          {bridges.map((b) => (
            <div key={b.id} className="p-3.5 rounded-xl bg-[#111216] border border-[#262a36] space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Box className="w-4 h-4 text-[#f5c518]" />
                  <span className="font-bold text-xs text-[#e5e7eb]">{b.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1e2330] text-[#60a5fa]">Port {b.port}</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#15231c] text-[#86efac] flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    {b.status}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-[#8e95a5]">One-click Python Listener Script:</span>
                <button
                  onClick={() => handleCopyScript(b.id, b.script)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#1a1e27] hover:bg-[#242936] text-[#cbd5e1] hover:text-[#f5c518] border border-[#2b313f] transition-colors"
                >
                  {copiedApp === b.id ? <Check className="w-3 h-3 text-[#22c55e]" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedApp === b.id ? 'Copied' : 'Copy Script'}</span>
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-5 py-3.5 bg-[#181b22] border-t border-[#292e3c]">
          <button
            onClick={() => setIsDccBridgeOpen(false)}
            className="px-5 py-2 rounded-xl bg-[#f5c518] hover:bg-[#eab308] text-[#111216] font-bold text-xs shadow-md shadow-[#f5c518]/20 transition-all"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
