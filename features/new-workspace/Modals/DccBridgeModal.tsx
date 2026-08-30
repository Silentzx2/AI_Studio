import React, { useState } from 'react';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[hsl(var(--surface-1))] p-4 select-none animate-in fade-in duration-200">
      <div className="w-full max-w-xl rounded-2xl bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-[hsl(var(--surface-1))] border-b border-[hsl(var(--border))]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] flex items-center justify-center text-[hsl(var(--primary))]">
              <Cable className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-[hsl(var(--foreground))]">DCC Bridge & Live Sync</h3>
              <p className="text-[11px] text-[hsl(var(--muted-foreground))]">Send 3D meshes & PBR textures directly into DCC software</p>
            </div>
          </div>
          <button
            onClick={() => setIsDccBridgeOpen(false)}
            className="p-1.5 rounded-lg text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-3.5 text-xs">
          {bridges.map((b) => (
            <div key={b.id} className="p-3.5 rounded-xl bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Box className="w-4 h-4 text-[hsl(var(--primary))]" />
                  <span className="font-bold text-xs text-[hsl(var(--foreground))]">{b.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[hsl(var(--surface-2))] text-[hsl(var(--neon-blue))]">Port {b.port}</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[hsl(var(--neon-green)/0.1)] text-[hsl(var(--neon-green))] flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    {b.status}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-[hsl(var(--muted-foreground))]">One-click Python Listener Script:</span>
                <button
                  onClick={() => handleCopyScript(b.id, b.script)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[hsl(var(--surface-1))] hover:bg-[hsl(var(--surface-2))] text-[hsl(var(--foreground))] hover:text-[hsl(var(--primary))] border border-[hsl(var(--border))] transition-colors"
                >
                  {copiedApp === b.id ? <Check className="w-3 h-3 text-[hsl(var(--neon-green))]" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedApp === b.id ? 'Copied' : 'Copy Script'}</span>
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-5 py-3.5 bg-[hsl(var(--surface-1))] border-t border-[hsl(var(--border))]">
          <button
            onClick={() => setIsDccBridgeOpen(false)}
            className="px-5 py-2 rounded-xl bg-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))] text-[hsl(var(--surface-1))] font-bold text-xs shadow-md shadow-[hsl(var(--primary))]/20 transition-all"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
