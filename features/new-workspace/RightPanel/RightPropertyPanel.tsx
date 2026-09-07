import React, { useState } from 'react';
import { 
  Sliders, 
  Download, 
  Box, 
  Move, 
  Check,
  Sparkles,
  Palette,
  Activity,
  Eye,
  RefreshCw,
  Lock,
  Unlock,
  Hexagon,
  ShieldCheck
} from 'lucide-react';
import { useWorkspace } from '../store/WorkspaceContext';
import { ShadingMode } from '../types';
import { SimpleTooltip } from '@/components/ui/simple-tooltip';

export const RightPropertyPanel: React.FC = () => {
  const { 
    currentAsset, 
    activeTool,
    shadingMode,
    setShadingMode,
    showWireframe,
    setShowWireframe,
    remeshSettings,
    textureSettings,
    generationSettings,
    systemStats
  } = useWorkspace();

  const [exportFormat, setExportFormat] = useState<'glb' | 'obj' | 'fbx' | 'usdz' | 'stl'>('glb');
  const [embedTextures, setEmbedTextures] = useState(true);
  const [dracoCompression, setDracoCompression] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);

  // ponytail: transforms are display-only — not applied to the 3D scene
  const [transform, setTransform] = useState({
    posX: 0,
    posY: 0,
    posZ: 0,
    rotX: 0,
    rotY: 0,
    rotZ: 0,
    scaleX: 1.0,
    scaleY: 1.0,
    scaleZ: 1.0,
    lockScale: true
  });

  // Material & PBR Shader Settings
  const [materialSettings, setMaterialSettings] = useState({
    albedoColor: 'hsl(0, 0%, 100%)',
    roughness: 0.45,
    metallic: 0.15,
    normalStrength: 1.0,
    ambientOcclusion: 0.85,
    displacementScale: 0.05,
    normalFormat: 'OpenGL' as 'OpenGL' | 'DirectX',
    uvProjection: 'Smart UV (xatlas)'
  });

  const handleScaleChange = (val: number) => {
    if (transform.lockScale) {
      setTransform(prev => ({ ...prev, scaleX: val, scaleY: val, scaleZ: val }));
    } else {
      setTransform(prev => ({ ...prev, scaleX: val }));
    }
  };

  const handleResetTransform = () => {
    setTransform({
      posX: 0,
      posY: 0,
      posZ: 0,
      rotX: 0,
      rotY: 0,
      rotZ: 0,
      scaleX: 1.0,
      scaleY: 1.0,
      scaleZ: 1.0,
      lockScale: true
    });
  };

  const handleExportDownload = async () => {
    if (!currentAsset?.source) return;
    setIsExporting(true);
    try {
      if (currentAsset.source.localUrl) {
        const link = document.createElement('a');
        link.href = currentAsset.source.localUrl;
        link.download = `${currentAsset.name}.${exportFormat}`;
        link.click();
      } else if (currentAsset.source.viewUrl) {
        const response = await fetch(currentAsset.source.viewUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = currentAsset.name;
        link.click();
        URL.revokeObjectURL(url);
      } else {
        throw new Error('Selected asset has no downloadable source.');
      }
      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 3000);
    } catch (error) {
      console.error(error);
      setExportSuccess(false);
    } finally {
      setIsExporting(false);
    }
  };



  if (!currentAsset) {
    return (
      <div id="panel-properties-inspector" className="flex h-full items-center justify-center bg-[hsl(var(--surface-1))] px-6 text-center">
        <div>
          <Box className="w-10 h-10 mx-auto mb-3 text-[hsl(var(--muted-foreground))]" />
          <div className="text-sm font-bold text-[hsl(var(--foreground))]">No asset selected</div>
          <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1.5 leading-relaxed">Generate or import a real 3D asset to inspect its properties and transforms.</div>
        </div>
      </div>
    );
  }


  return (
    <div 
      id="panel-properties-inspector" 
      className="flex flex-col h-full bg-[hsl(var(--surface-1))] text-xs select-none overflow-hidden"
    >
      {/* Header with Asset Meta */}
      <div className="p-2.5 border-b border-[hsl(var(--border))] flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-[hsl(var(--surface-3))] border border-[hsl(var(--border))] flex items-center justify-center text-[hsl(var(--primary))] flex-shrink-0">
            <Sliders className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h2 className="font-bold text-sm text-[hsl(var(--foreground))] truncate">{currentAsset.name}</h2>
            <span className="text-xs text-[hsl(var(--muted-foreground))] block">Inspector & Properties</span>
          </div>
        </div>
        <span className="text-xs uppercase font-mono font-bold px-2 py-0.5 rounded-md bg-[hsl(var(--surface-3))] border border-[hsl(var(--border))] text-[hsl(var(--primary))] flex-shrink-0">
          {currentAsset.format}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-2.5 space-y-3 no-scrollbar">
        {/* 1. Object Transform Section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider flex items-center gap-1.5">
              <Move className="w-3.5 h-3.5 text-[hsl(var(--primary))]" />
              Object Transform
            </span>
            <button
              onClick={handleResetTransform}
              className="p-1 rounded text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))] transition-colors"
            >
              <SimpleTooltip label="Reset Transform">
                <RefreshCw className="w-3.5 h-3.5" />
              </SimpleTooltip>
            </button>
          </div>

          {/* Position (m) */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-[hsl(var(--muted-foreground))]">
              <span>Position (m)</span>
              <span className="font-mono text-[hsl(var(--muted-foreground))]">World Space</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5 font-mono text-xs">
              <div className="flex items-center px-2 py-1 rounded-lg bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))]">
                <span className="text-[hsl(var(--destructive))] font-bold mr-1 text-xs">X</span>
                <input 
                  type="number" 
                  step="0.1" 
                  value={transform.posX} 
                  onChange={(e) => setTransform(p => ({ ...p, posX: parseFloat(e.target.value) || 0 }))}
                  className="w-full bg-transparent text-[hsl(var(--foreground))] outline-none" 
                />
              </div>
              <div className="flex items-center px-2 py-1 rounded-lg bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))]">
                <span className="text-[hsl(var(--neon-green))] font-bold mr-1 text-xs">Y</span>
                <input 
                  type="number" 
                  step="0.1" 
                  value={transform.posY} 
                  onChange={(e) => setTransform(p => ({ ...p, posY: parseFloat(e.target.value) || 0 }))}
                  className="w-full bg-transparent text-[hsl(var(--foreground))] outline-none" 
                />
              </div>
              <div className="flex items-center px-2 py-1 rounded-lg bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))]">
                <span className="text-[hsl(var(--neon-blue))] font-bold mr-1 text-xs">Z</span>
                <input 
                  type="number" 
                  step="0.1" 
                  value={transform.posZ} 
                  onChange={(e) => setTransform(p => ({ ...p, posZ: parseFloat(e.target.value) || 0 }))}
                  className="w-full bg-transparent text-[hsl(var(--foreground))] outline-none" 
                />
              </div>
            </div>
          </div>

          {/* Rotation (°) */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-[hsl(var(--muted-foreground))]">
              <span>Rotation (Euler °)</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5 font-mono text-xs">
              <div className="flex items-center px-2 py-1 rounded-lg bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))]">
                <span className="text-[hsl(var(--destructive))] font-bold mr-1 text-xs">X</span>
                <input 
                  type="number" 
                  value={transform.rotX} 
                  onChange={(e) => setTransform(p => ({ ...p, rotX: parseFloat(e.target.value) || 0 }))}
                  className="w-full bg-transparent text-[hsl(var(--foreground))] outline-none" 
                />
              </div>
              <div className="flex items-center px-2 py-1 rounded-lg bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))]">
                <span className="text-[hsl(var(--neon-green))] font-bold mr-1 text-xs">Y</span>
                <input 
                  type="number" 
                  value={transform.rotY} 
                  onChange={(e) => setTransform(p => ({ ...p, rotY: parseFloat(e.target.value) || 0 }))}
                  className="w-full bg-transparent text-[hsl(var(--foreground))] outline-none" 
                />
              </div>
              <div className="flex items-center px-2 py-1 rounded-lg bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))]">
                <span className="text-[hsl(var(--neon-blue))] font-bold mr-1 text-xs">Z</span>
                <input 
                  type="number" 
                  value={transform.rotZ} 
                  onChange={(e) => setTransform(p => ({ ...p, rotZ: parseFloat(e.target.value) || 0 }))}
                  className="w-full bg-transparent text-[hsl(var(--foreground))] outline-none" 
                />
              </div>
            </div>
          </div>

          {/* Scale */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-[hsl(var(--muted-foreground))]">
              <span>Scale Ratio</span>
              <button
                onClick={() => setTransform(p => ({ ...p, lockScale: !p.lockScale }))}
                className="flex items-center gap-1 text-[hsl(var(--primary))] hover:underline text-[11px]"
              >
                {transform.lockScale ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                <span>{transform.lockScale ? 'Uniform Locked' : 'Independent'}</span>
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1.5 font-mono text-xs">
              <div className="flex items-center px-2 py-1 rounded-lg bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))]">
                <span className="text-[hsl(var(--destructive))] font-bold mr-1 text-xs">X</span>
                <input 
                  type="number" 
                  step="0.05" 
                  value={transform.scaleX} 
                  onChange={(e) => handleScaleChange(parseFloat(e.target.value) || 1)}
                  className="w-full bg-transparent text-[hsl(var(--foreground))] outline-none" 
                />
              </div>
              <div className="flex items-center px-2 py-1 rounded-lg bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))]">
                <span className="text-[hsl(var(--neon-green))] font-bold mr-1 text-xs">Y</span>
                <input 
                  type="number" 
                  step="0.05" 
                  value={transform.scaleY} 
                  onChange={(e) => setTransform(p => ({ ...p, scaleY: parseFloat(e.target.value) || 1 }))}
                  disabled={transform.lockScale}
                  className={`w-full bg-transparent text-[hsl(var(--foreground))] outline-none ${transform.lockScale ? 'opacity-70' : ''}`} 
                />
              </div>
              <div className="flex items-center px-2 py-1 rounded-lg bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))]">
                <span className="text-[hsl(var(--neon-blue))] font-bold mr-1 text-xs">Z</span>
                <input 
                  type="number" 
                  step="0.05" 
                  value={transform.scaleZ} 
                  onChange={(e) => setTransform(p => ({ ...p, scaleZ: parseFloat(e.target.value) || 1 }))}
                  disabled={transform.lockScale}
                  className={`w-full bg-transparent text-[hsl(var(--foreground))] outline-none ${transform.lockScale ? 'opacity-70' : ''}`} 
                />
              </div>
            </div>
          </div>
        </div>

        {/* 2. Geometry Statistics & Topology Health */}
        <div className="p-3 rounded-xl bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] space-y-2.5">
          <div className="flex items-center justify-between text-[hsl(var(--foreground))] font-semibold">
            <span className="flex items-center gap-1.5 text-xs font-bold">
              <Box className="w-3.5 h-3.5 text-[hsl(var(--primary))]" />
              Geometry Topology
            </span>
            <span className="flex items-center gap-1 text-[10px] text-[hsl(var(--neon-green))] font-mono px-1.5 py-0.5 rounded bg-[hsl(var(--neon-green))]/10 border border-[hsl(var(--neon-green))]/30">
              <ShieldCheck className="w-3 h-3" />
              Manifold OK
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1.5 font-mono text-xs">
            <div className="p-2 rounded-lg bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))]">
              <span className="text-[hsl(var(--muted-foreground))] block text-[10px]">Vertices</span>
              <span className="font-bold text-[hsl(var(--foreground))]">{currentAsset.statsAvailable ? currentAsset.vertices.toLocaleString() : '—'}</span>
            </div>
            <div className="p-2 rounded-lg bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))]">
              <span className="text-[hsl(var(--muted-foreground))] block text-[10px]">Polygons</span>
              <span className="font-bold text-[hsl(var(--primary))]">{currentAsset.statsAvailable ? currentAsset.faces.toLocaleString() : '—'}</span>
            </div>
            <div className="p-2 rounded-lg bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))]">
              <span className="text-[hsl(var(--muted-foreground))] block text-[10px]">Topology</span>
              <span className="font-bold text-[hsl(var(--neon-blue))] truncate block">{currentAsset.topology}</span>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-[hsl(var(--muted-foreground))] pt-1 border-t border-[hsl(var(--border))]">
            <span>UV Channels</span>
            <span className="font-mono text-[hsl(var(--foreground))]">2 (UV0: Diffuse, UV1: Lightmap)</span>
          </div>
        </div>

        {/* 3. Dynamic Context-Aware Inspector Sections based on activeTool */}
        
        {/* 3. Dynamic Context-Aware Inspector Sections based on activeTool */}
        
        {/* CASE A: Tool is Texture or PBR */}
        {(activeTool === 'texture' || activeTool === 'pbr') && (
          <div className="space-y-3 p-3 rounded-xl bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))]">
            <span className="font-bold text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-[hsl(var(--primary))]" />
              PBR Material Channels
            </span>

            {/* Roughness */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-[hsl(var(--foreground))]">
                <span>Roughness</span>
                <span className="font-mono font-bold text-[hsl(var(--primary))]">{materialSettings.roughness.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.02"
                value={materialSettings.roughness}
                onChange={(e) => setMaterialSettings(p => ({ ...p, roughness: parseFloat(e.target.value) }))}
                className="w-full accent-[hsl(var(--primary))] cursor-pointer"
              />
            </div>

            {/* Metallic */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-[hsl(var(--foreground))]">
                <span>Metallic</span>
                <span className="font-mono font-bold text-[hsl(var(--primary))]">{materialSettings.metallic.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.02"
                value={materialSettings.metallic}
                onChange={(e) => setMaterialSettings(p => ({ ...p, metallic: parseFloat(e.target.value) }))}
                className="w-full accent-[hsl(var(--primary))] cursor-pointer"
              />
            </div>

            {/* Normal Strength */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-[hsl(var(--foreground))]">
                <span>Normal Intensity</span>
                <span className="font-mono font-bold text-[hsl(var(--primary))]">{materialSettings.normalStrength.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="0"
                max="3"
                step="0.1"
                value={materialSettings.normalStrength}
                onChange={(e) => setMaterialSettings(p => ({ ...p, normalStrength: parseFloat(e.target.value) }))}
                className="w-full accent-[hsl(var(--primary))] cursor-pointer"
              />
            </div>

            {/* Ambient Occlusion */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-[hsl(var(--foreground))]">
                <span>Cavity & AO Strength</span>
                <span className="font-mono font-bold text-[hsl(var(--primary))]">{materialSettings.ambientOcclusion.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={materialSettings.ambientOcclusion}
                onChange={(e) => setMaterialSettings(p => ({ ...p, ambientOcclusion: parseFloat(e.target.value) }))}
                className="w-full accent-[hsl(var(--primary))] cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between text-xs text-[hsl(var(--muted-foreground))] pt-1.5 border-t border-[hsl(var(--border))]">
              <span>Normal Standard</span>
              <div className="flex gap-1.5">
                {(['OpenGL', 'DirectX'] as const).map(fmt => (
                  <button
                    key={fmt}
                    onClick={() => setMaterialSettings(p => ({ ...p, normalFormat: fmt }))}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-mono font-bold transition-colors ${
                      materialSettings.normalFormat === fmt
                        ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                        : 'bg-[hsl(var(--surface-2))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
                    }`}
                  >
                    {fmt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* CASE B: Tool is Retopo / Remesh */}
        {(activeTool === 'remesh') && (
          <div className="space-y-3 p-3 rounded-xl bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))]">
            <span className="font-bold text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider flex items-center gap-1.5">
              <Hexagon className="w-3.5 h-3.5 text-[hsl(var(--primary))]" />
              Quad Retopology Inspector
            </span>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-[hsl(var(--foreground))]">
                <span>Target Polycount</span>
                <span className="font-mono font-bold text-[hsl(var(--primary))]">{remeshSettings.targetFaces.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-[hsl(var(--foreground))]">
                <span>Topology Mode</span>
                <span className="font-mono text-[hsl(var(--neon-blue))] uppercase">{remeshSettings.mode}</span>
              </div>
              <div className="flex justify-between text-[hsl(var(--foreground))]">
                <span>Detail Preservation</span>
                <span className="font-mono text-[hsl(var(--foreground))] uppercase">{remeshSettings.detailPreservation}</span>
              </div>
              <div className="flex justify-between text-[hsl(var(--foreground))]">
                <span>Quad Flow Alignment</span>
                <span className="font-mono text-[hsl(var(--neon-green))]">{currentAsset.topology} • {currentAsset.statsAvailable ? currentAsset.faces.toLocaleString() : '—'} faces</span>
              </div>
            </div>
          </div>
        )}

        {/* CASE D: Tool is 3D Generation / Model */}
        {activeTool === 'model' && (
          <div className="space-y-3 p-3 rounded-xl bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))]">
            <span className="font-bold text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[hsl(var(--primary))]" />
              3D AI Generator Pipeline
            </span>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-[hsl(var(--foreground))]">
                <span>Model Engine</span>
                <span className="font-mono text-[hsl(var(--primary))]">{generationSettings.aiModel}</span>
              </div>
              <div className="flex justify-between text-[hsl(var(--foreground))]">
                <span>Octree Depth</span>
                <span className="font-mono text-[hsl(var(--foreground))]">Not available until workflow execution</span>
              </div>
              <div className="flex justify-between text-[hsl(var(--foreground))]">
                <span>Diffusion Steps</span>
                <span className="font-mono text-[hsl(var(--foreground))]">Workflow-defined</span>
              </div>
              <div className="flex justify-between text-[hsl(var(--foreground))]">
                <span>Cutout RMBG</span>
                <span className="font-mono text-[hsl(var(--neon-green))]">{generationSettings.removeBackground ? 'Requested' : 'Off'}</span>
              </div>
            </div>
          </div>
         )}
        
        {/* 4. Shading & Render Viewport Overrides */}
        <div className="space-y-2 pt-1">
          <span className="font-bold text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5 text-[hsl(var(--primary))]" />
            Viewport Shading
          </span>

          <div className="grid grid-cols-3 gap-1.5">
            <button
              onClick={() => setShadingMode('textured')}
              className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-all ${
                shadingMode === 'textured'
                  ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-bold shadow'
                  : 'bg-[hsl(var(--surface-2))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] border border-[hsl(var(--border))]'
              }`}
            >
              PBR Lit
            </button>

            <button
              onClick={() => setShadingMode('wireframe')}
              className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-all ${
                shadingMode === 'wireframe'
                  ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-bold shadow'
                  : 'bg-[hsl(var(--surface-2))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] border border-[hsl(var(--border))]'
              }`}
            >
              Wireframe
            </button>

            <button
              onClick={() => setShadingMode('normals')}
              className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-all ${
                shadingMode === 'normals'
                  ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-bold shadow'
                  : 'bg-[hsl(var(--surface-2))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] border border-[hsl(var(--border))]'
              }`}
            >
              Normals
            </button>

            <button
              onClick={() => setShadingMode('matcap')}
              className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-all ${
                shadingMode === 'matcap'
                  ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-bold shadow'
                  : 'bg-[hsl(var(--surface-2))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] border border-[hsl(var(--border))]'
              }`}
            >
              MatCap
            </button>

            <button
              onClick={() => setShadingMode('textured')}
              className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-all ${
                shadingMode === 'textured'
                  ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-bold shadow'
                  : 'bg-[hsl(var(--surface-2))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] border border-[hsl(var(--border))]'
              }`}
            >
              Albedo
            </button>

            <button
              onClick={() => setShowWireframe(!showWireframe)}
              className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-all ${
                showWireframe
                  ? 'bg-[hsl(var(--accent))] text-white font-bold'
                  : 'bg-[hsl(var(--surface-2))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] border border-[hsl(var(--border))]'
              }`}
            >
              + Wire Overlay
            </button>
          </div>
        </div>

        {/* 5. Production Export Section */}
        <div className="pt-3 border-t border-[hsl(var(--border))] space-y-3">
          <span className="font-bold text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5 text-[hsl(var(--primary))]" />
            Quick Export Asset
          </span>

          {/* Formats Grid */}
          <div className="grid grid-cols-5 gap-1.5">
            {(['glb', 'obj', 'fbx', 'usdz', 'stl'] as const).map((fmt) => (
              <button
                key={fmt}
                onClick={() => setExportFormat(fmt)}
                className={`py-1.5 rounded-lg uppercase font-mono font-bold text-xs transition-colors ${
                  exportFormat === fmt
                    ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                    : 'bg-[hsl(var(--surface-2))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] border border-[hsl(var(--border))]'
                }`}
              >
                {fmt}
              </button>
            ))}
          </div>

          {/* Export Options Toggles */}
          <div className="space-y-2 text-xs">
            <label className="flex items-center justify-between text-[hsl(var(--foreground))] cursor-pointer">
              <span>Embed PBR Textures</span>
              <input
                type="checkbox"
                checked={embedTextures}
                onChange={(e) => setEmbedTextures(e.target.checked)}
                className="rounded accent-[hsl(var(--primary))] cursor-pointer"
              />
            </label>
            <label className="flex items-center justify-between text-[hsl(var(--foreground))] cursor-pointer">
              <span>Draco Mesh Compression</span>
              <input
                type="checkbox"
                checked={dracoCompression}
                onChange={(e) => setDracoCompression(e.target.checked)}
                className="rounded accent-[hsl(var(--primary))] cursor-pointer"
              />
            </label>
          </div>

          {/* Download Button */}
          <button
            id="btn-export-download"
            onClick={handleExportDownload}
            disabled={isExporting}
            className="w-full py-2.5 rounded-xl bg-[hsl(var(--surface-3))] hover:bg-[hsl(var(--surface-4))] border border-[hsl(var(--border))] text-[hsl(var(--primary))] font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-md cursor-pointer"
          >
            {isExporting ? (
              <RefreshCw className="w-4 h-4 animate-spin text-[hsl(var(--primary))]" />
            ) : exportSuccess ? (
              <Check className="w-4 h-4 text-[hsl(var(--neon-green))]" />
            ) : (
              <Download className="w-4 h-4 text-[hsl(var(--primary))]" />
            )}
            <span>
              {isExporting ? 'Packing 3D Bundle...' : exportSuccess ? 'Export Saved!' : `Download ${exportFormat.toUpperCase()} Asset`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
