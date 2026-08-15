"use client";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * File 2 — 3D Canvas
 * Production 3D workspace: real model viewer, floating material bar, bottom navigation dock,
 * lighting presets, snapshot tool, orientation gizmo, geometry stats HUD, and drag-drop support.
 */

import React, { useRef, useEffect, useState, useCallback, Suspense } from 'react';
import { Canvas, useThree, useLoader } from '@react-three/fiber';
import {
  OrbitControls, Grid, Environment, Center, Html, useProgress,
  Preload, useGLTF, Stats
} from '@react-three/drei';
import {
  Mesh, Group, Box3, Vector3, MeshStandardMaterial, MeshNormalMaterial,
  Color
} from 'three';
import * as THREE from 'three';
import { FBXLoader, OBJLoader, STLLoader } from 'three-stdlib';
import { useUIStore, registerResetCamera } from '@/stores/useUIStore';
import { useGenerationStore } from '@/stores/useGenerationStore';
import { useThemeStore } from '@/stores/useThemeStore';
import { uploadService } from '@/services/uploadService';
import { GlowRing } from '@/components/GlowRing';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  MousePointer2, Move, ZoomIn, RotateCcw, Grid3X3,
  Box, BarChart3, Sun, Camera, Upload, Loader2, AlertCircle,
  Minimize2, Expand, Focus, Play, Layers, Check, ChevronDown,
  Edit2, HelpCircle, Sparkles, Hash, Package, ShieldCheck
} from 'lucide-react';

/* ─────────────────────────────────────────────────── */
/*  Three.js Cleanup Helper                            */
/* ─────────────────────────────────────────────────── */

function disposeObject(object: any) {
  if (object.isMesh) {
    if (object.geometry) object.geometry.dispose();
    const mats = Array.isArray(object.material) ? object.material : [object.material];
    mats.forEach((m: any) => {
      ['map','lightMap','aoMap','emissiveMap','bumpMap','normalMap','roughnessMap','metalnessMap','alphaMap']
        .forEach((k: string) => { if (m[k]) m[k].dispose(); });
      m.dispose();
    });
  }
  if (!object.isScene && !object.isLight) object.traverse(disposeObject);
}

/* ─────────────────────────────────────────────────── */
/*  Material Shading Modes                             */
/* ─────────────────────────────────────────────────── */

export type ShadingPreset = 'default' | 'clay' | 'metallic' | 'wireframe' | 'normal' | 'gold' | 'cyberpunk' | 'uv';

function applyShading(root: any, mode: ShadingPreset, wireframeOverlay: boolean) {
  if (!root) return;
  root.traverse((child: any) => {
    if (child.isMesh) {
      if (!child.userData.origMaterial) {
        child.userData.origMaterial = child.material;
      }
      if (mode === 'default') {
        child.material = child.userData.origMaterial;
        if (child.material) (child.material as any).wireframe = wireframeOverlay;
      } else if (mode === 'clay') {
        child.material = new MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.85, metalness: 0.05, wireframe: wireframeOverlay });
      } else if (mode === 'metallic') {
        child.material = new MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.08, metalness: 0.95, wireframe: wireframeOverlay });
      } else if (mode === 'normal') {
        child.material = new MeshNormalMaterial({ wireframe: wireframeOverlay });
      } else if (mode === 'gold') {
        child.material = new MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.25, metalness: 0.9, wireframe: wireframeOverlay });
      } else if (mode === 'cyberpunk') {
        child.material = new MeshStandardMaterial({ color: 0x0284c7, emissive: 0x0369a1, emissiveIntensity: 0.35, roughness: 0.2, metalness: 0.85, wireframe: wireframeOverlay });
      } else if (mode === 'uv') {
        child.material = new MeshStandardMaterial({ color: 0x8b5cf6, roughness: 0.5, metalness: 0.3, wireframe: wireframeOverlay });
      } else if (mode === 'wireframe') {
        child.material = new MeshStandardMaterial({ color: 0x38bdf8, wireframe: true });
      }
    }
  });
}

/* ─────────────────────────────────────────────────── */
/*  Live Mesh Inspection Helper                        */
/* ─────────────────────────────────────────────────── */

export interface ModelStats {
  vertices: number;
  triangles: number;
  dimensions: { x: number; y: number; z: number };
}

function calculateMeshStats(object: any): ModelStats {
  let vertices = 0;
  let triangles = 0;
  if (!object) return { vertices: 0, triangles: 0, dimensions: { x: 0, y: 0, z: 0 } };

  object.traverse((child: any) => {
    if (child.isMesh && child.geometry) {
      const geo = child.geometry;
      if (geo.attributes?.position) {
        vertices += geo.attributes.position.count;
      }
      if (geo.index) {
        triangles += geo.index.count / 3;
      } else if (geo.attributes?.position) {
        triangles += geo.attributes.position.count / 3;
      }
    }
  });

  const box = new Box3().setFromObject(object);
  const size = box.getSize(new Vector3());

  return {
    vertices,
    triangles: Math.round(triangles),
    dimensions: {
      x: Number(size.x.toFixed(2)),
      y: Number(size.y.toFixed(2)),
      z: Number(size.z.toFixed(2)),
    },
  };
}

/* ─────────────────────────────────────────────────── */
/*  Loading & Canvas Helpers                           */
/* ─────────────────────────────────────────────────── */

function CanvasLoadingScreen() {
  const { progress } = useProgress();
  return (
    <Html center>
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-2 border-white/5 border-t-[hsl(var(--primary))] rounded-full animate-spin shadow-[0_0_15px_hsl(var(--primary)/0.2)]" />
        <div className="px-3 py-1 bg-black/60 backdrop-blur-md rounded-full border border-white/10">
          <p className="text-[10px] text-white/90 font-black tracking-widest uppercase">{progress.toFixed(0)}%</p>
        </div>
      </div>
    </Html>
  );
}

function CanvasResizeSync() {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const el = gl.domElement.parentElement;
    if (!el) return;
    const sync = () => {
      const { clientWidth, clientHeight } = el;
      if (clientWidth && clientHeight) {
        gl.setSize(clientWidth, clientHeight, false);
        invalidate();
      }
    };
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    sync();
    return () => ro.disconnect();
  }, [gl, invalidate]);
  return null;
}

function frameModel(groupRef: React.RefObject<Group | null>, camera: any, controls: any) {
  if (!groupRef.current) return;
  const box = new Box3().setFromObject(groupRef.current);
  const size = box.getSize(new Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const center = box.getCenter(new Vector3());
  groupRef.current.position.sub(center);
  groupRef.current.position.y += size.y * 0.5;
  const fov = camera.fov ?? 45;
  const distance = (maxDim / 2 / Math.tan((fov * Math.PI) / 360)) * 1.6;
  camera.position.set(0, size.y * 0.5 + maxDim * 0.2, distance);
  camera.lookAt(0, size.y * 0.5, 0);
  if (controls) { controls.target.set(0, size.y * 0.5, 0); controls.update(); }
}

function GLBModel({
  url,
  shadingMode,
  wireframe,
  onStats,
}: {
  url: string;
  shadingMode: ShadingPreset;
  wireframe: boolean;
  onStats?: (stats: ModelStats) => void;
}) {
  const { scene } = useGLTF(url);
  const groupRef = useRef<Group>(null);
  const { camera } = useThree();

  useEffect(() => {
    if (!groupRef.current) return;
    applyShading(groupRef.current, shadingMode, wireframe);
    frameModel(groupRef, camera, (window as any).__orbitControls);
    if (onStats) {
      onStats(calculateMeshStats(groupRef.current));
    }
  }, [shadingMode, wireframe, scene, camera, onStats]);

  return (
    <group ref={groupRef}>
      <primitive object={scene} />
    </group>
  );
}

function FbxModel({
  url,
  shadingMode,
  wireframe,
  onStats,
}: {
  url: string;
  shadingMode: ShadingPreset;
  wireframe: boolean;
  onStats?: (stats: ModelStats) => void;
}) {
  const obj = useLoader(FBXLoader, url);
  const groupRef = useRef<Group>(null);
  const { camera } = useThree();

  useEffect(() => {
    if (!groupRef.current) return;
    applyShading(groupRef.current, shadingMode, wireframe);
    frameModel(groupRef, camera, (window as any).__orbitControls);
    if (onStats) {
      onStats(calculateMeshStats(groupRef.current));
    }
  }, [shadingMode, wireframe, obj, camera, onStats]);

  useEffect(() => () => { if (groupRef.current) disposeObject(groupRef.current); }, []);
  return (
    <group ref={groupRef}>
      <primitive object={obj} />
    </group>
  );
}

function ObjModel({
  url,
  shadingMode,
  wireframe,
  onStats,
}: {
  url: string;
  shadingMode: ShadingPreset;
  wireframe: boolean;
  onStats?: (stats: ModelStats) => void;
}) {
  const obj = useLoader(OBJLoader, url);
  const groupRef = useRef<Group>(null);
  const { camera } = useThree();

  useEffect(() => {
    if (!groupRef.current) return;
    applyShading(groupRef.current, shadingMode, wireframe);
    frameModel(groupRef, camera, (window as any).__orbitControls);
    if (onStats) {
      onStats(calculateMeshStats(groupRef.current));
    }
  }, [shadingMode, wireframe, obj, camera, onStats]);

  useEffect(() => () => { if (groupRef.current) disposeObject(groupRef.current); }, []);
  return (
    <group ref={groupRef}>
      <primitive object={obj} />
    </group>
  );
}

function StlModel({
  url,
  shadingMode,
  wireframe,
  onStats,
}: {
  url: string;
  shadingMode: ShadingPreset;
  wireframe: boolean;
  onStats?: (stats: ModelStats) => void;
}) {
  const geometry = useLoader(STLLoader, url);
  const groupRef = useRef<Group>(null);
  const { camera } = useThree();

  useEffect(() => {
    if (!groupRef.current) return;
    applyShading(groupRef.current, shadingMode, wireframe);
    frameModel(groupRef, camera, (window as any).__orbitControls);
    if (onStats) {
      onStats(calculateMeshStats(groupRef.current));
    }
  }, [shadingMode, wireframe, geometry, camera, onStats]);

  useEffect(() => () => { if (groupRef.current) disposeObject(groupRef.current); }, []);
  return (
    <group ref={groupRef}>
      <mesh geometry={geometry}>
        <meshStandardMaterial color="#cccccc" wireframe={wireframe} />
      </mesh>
    </group>
  );
}

function CameraController({ autoRotate, activeTool }: { autoRotate: boolean; activeTool: string }) {
  const { camera, gl } = useThree();
  const orbitRef = useRef<any>(null);

  useEffect(() => {
    registerResetCamera(() => {
      if (orbitRef.current) {
        orbitRef.current.reset();
      }
      camera.position.set(0, 2, 5.5);
      camera.lookAt(0, 0.5, 0);
    });
  }, [camera]);

  useEffect(() => {
    (window as any).__orbitControls = orbitRef.current;
    (window as any).__threeGL = gl;
    return () => {
      if ((window as any).__orbitControls === orbitRef.current) {
        (window as any).__orbitControls = null;
      }
    };
  }, [gl]);

  const mouseButtons = {
    LEFT: activeTool === 'pan' ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: activeTool === 'orbit' ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
  };

  return (
    <OrbitControls
      ref={orbitRef}
      autoRotate={autoRotate}
      autoRotateSpeed={1.8}
      enableDamping
      dampingFactor={0.08}
      minDistance={0.8}
      maxDistance={25}
      mouseButtons={mouseButtons}
      makeDefault
    />
  );
}

function SceneGrid({ visible }: { visible: boolean }) {
  const accentColor = useThemeStore((s) => s.accentColor);
  if (!visible) return null;
  return (
    <Grid
      position={[0, -0.01, 0]}
      args={[24, 24]}
      cellSize={0.4}
      cellThickness={0.4}
      cellColor={accentColor}
      sectionSize={2.0}
      sectionThickness={0.8}
      sectionColor={accentColor}
      fadeDistance={22}
      fadeStrength={1}
      infiniteGrid
    />
  );
}

function ErrorIndicator() {
  return (
    <Html center>
      <div className="flex flex-col items-center gap-3 pointer-events-none select-none">
        <AlertCircle size={32} className="text-[hsl(var(--destructive))/0.6]" />
        <p className="text-xs font-bold text-[hsl(var(--destructive))/0.7]">Failed to load model</p>
      </div>
    </Html>
  );
}

class ErrorBoundary extends React.Component<{ fallback: React.ReactNode; onError?: () => void; children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch() { this.props.onError?.(); }
  render() { return this.state.hasError ? this.props.fallback : this.props.children; }
}

function InnerScene({
  shadingMode,
  lightingPreset,
  activeTool,
  onHasModelChange,
  onStatsUpdate,
}: {
  shadingMode: ShadingPreset;
  lightingPreset: 'studio' | 'sunset' | 'cyberpunk' | 'ambient';
  activeTool: string;
  onHasModelChange?: (hasModel: boolean) => void;
  onStatsUpdate?: (stats: ModelStats) => void;
}) {
  const { viewer } = useUIStore();
  const { currentJob } = useGenerationStore();
  const hasJobModel = currentJob?.status === 'completed' && currentJob.result;
  const modelUrl = currentJob?.result?.downloadUrls?.glb || currentJob?.result?.modelUrl;
  const [userModelUrl, setUserModelUrl] = useState<string | null>(null);
  const [modelError, setModelError] = useState(false);

  const handleLoadGlb = useCallback((e: CustomEvent) => {
    const url: string = e.detail?.url;
    if (!url) return;
    setUserModelUrl((prev) => {
      if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
      return url;
    });
    setModelError(false);
  }, []);

  useEffect(() => {
    window.addEventListener('load-glb-model', handleLoadGlb as EventListener);
    return () => {
      window.removeEventListener('load-glb-model', handleLoadGlb as EventListener);
      setUserModelUrl((prev) => {
        if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [handleLoadGlb]);

  const activeUrl = userModelUrl || (hasJobModel && modelUrl ? modelUrl : null);
  const showModel = !!activeUrl && !modelError;

  useEffect(() => {
    onHasModelChange?.(showModel);
  }, [showModel, onHasModelChange]);

  const getExt = (url: string) => {
    const m = url.match(/\.([^.]+)$/);
    return m ? m[1].toLowerCase() : '';
  };

  const renderModel = (url: string) => {
    const ext = getExt(url);
    return (
      <ErrorBoundary fallback={<ErrorIndicator />} onError={() => setModelError(true)}>
        <Suspense fallback={<CanvasLoadingScreen />}>
          {(ext === 'glb' || ext === 'gltf' || !ext) ? (
            <GLBModel url={url} shadingMode={shadingMode} wireframe={viewer.showWireframe} onStats={onStatsUpdate} />
          ) : ext === 'fbx' ? (
            <FbxModel url={url} shadingMode={shadingMode} wireframe={viewer.showWireframe} onStats={onStatsUpdate} />
          ) : ext === 'obj' ? (
            <ObjModel url={url} shadingMode={shadingMode} wireframe={viewer.showWireframe} onStats={onStatsUpdate} />
          ) : ext === 'stl' ? (
            <StlModel url={url} shadingMode={shadingMode} wireframe={viewer.showWireframe} onStats={onStatsUpdate} />
          ) : (
            <GLBModel url={url} shadingMode={shadingMode} wireframe={viewer.showWireframe} onStats={onStatsUpdate} />
          )}
        </Suspense>
      </ErrorBoundary>
    );
  };

  return (
    <>
      <CameraController autoRotate={viewer.autoRotate} activeTool={activeTool} />

      {/* Dynamic Lighting Presets */}
      {lightingPreset === 'studio' && (
        <>
          <ambientLight intensity={0.6} />
          <directionalLight position={[6, 10, 8]} intensity={2.0} color="#ffffff" />
          <directionalLight position={[-8, 5, -4]} intensity={1.0} color="#93c5fd" />
          <directionalLight position={[0, 4, -10]} intensity={0.8} color="#fed7aa" />
          <pointLight position={[-4, 2, 6]} intensity={0.5} color="#38bdf8" />
        </>
      )}

      {lightingPreset === 'sunset' && (
        <>
          <ambientLight intensity={0.5} color="#fdba74" />
          <directionalLight position={[8, 4, 6]} intensity={2.6} color="#fb923c" />
          <directionalLight position={[-6, 6, -6]} intensity={1.0} color="#c084fc" />
          <pointLight position={[0, -1, 4]} intensity={0.7} color="#f43f5e" />
        </>
      )}

      {lightingPreset === 'cyberpunk' && (
        <>
          <ambientLight intensity={0.4} color="#0f172a" />
          <directionalLight position={[7, 8, 5]} intensity={2.0} color="#06b6d4" />
          <directionalLight position={[-7, 5, -4]} intensity={2.0} color="#ec4899" />
          <pointLight position={[0, 3, 5]} intensity={1.2} color="#8b5cf6" />
        </>
      )}

      {lightingPreset === 'ambient' && (
        <>
          <ambientLight intensity={1.2} color="#ffffff" />
          <directionalLight position={[0, 10, 0]} intensity={1.0} color="#ffffff" />
        </>
      )}

      <Suspense fallback={null}>
        <Environment preset="studio" />
      </Suspense>

      <Center>
        {showModel && activeUrl ? renderModel(activeUrl) : null}
      </Center>

      <SceneGrid visible={viewer.showGrid} />
      <CanvasResizeSync />
      <Preload all />
    </>
  );
}

/* ─────────────────────────────────────────────────── */
/*  Main Canvas3D Component Export                     */
/* ─────────────────────────────────────────────────── */

interface Canvas3DProps {
  isGenerating?: boolean;
}

const SUPPORTED_3D_EXTS = ['.glb', '.gltf', '.fbx', '.obj', '.stl'];

export default function Canvas3D({ isGenerating }: Canvas3DProps) {
   const containerRef = useRef<HTMLDivElement>(null);
   const { viewer, toggleAutoRotate, toggleGrid, toggleWireframe, toggleFullscreen, toggleStats, resetCamera } = useUIStore();
   const [isDragOver, setIsDragOver] = useState(false);
   const [isUploading, setIsUploading] = useState(false);
   const [uploadProgress, setUploadProgress] = useState<{ loaded: number; total: number; percent: number } | null>(null);
   const uploadCancelRef = useRef<( () => void ) | null>(null);
   const [hasModelInScene, setHasModelInScene] = useState(false);
   const [liveStats, setLiveStats] = useState<ModelStats | null>(null);

  // Active Viewport Navigation Tool
  const [activeTool, setActiveTool] = useState<'select' | 'orbit' | 'pan' | 'zoom'>('orbit');

  // Shading Preset Mode
  const [shadingMode, setShadingMode] = useState<ShadingPreset>('default');
  const [showShadingMenu, setShowShadingMenu] = useState(false);

  // Lighting Preset
  const [lightingPreset, setLightingPreset] = useState<'studio' | 'sunset' | 'cyberpunk' | 'ambient'>('studio');
  const [showLightingMenu, setShowLightingMenu] = useState(false);

  // Project Title
  const [projectName, setProjectName] = useState('Untitled 3D Model');
  const [isEditingTitle, setIsEditingTitle] = useState(false);

  // Take Snapshot HD Screenshot
  const handleTakeSnapshot = () => {
    try {
      const gl = (window as any).__threeGL;
      if (!gl || !gl.domElement) {
        toast.error('Could not capture 3D canvas');
        return;
      }
      const dataUrl = gl.domElement.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `${projectName.toLowerCase().replace(/\s+/g, '_')}_render.png`;
      link.href = dataUrl;
      link.click();
      toast.success('Snapshot captured & downloaded!');
    } catch {
      toast.error('Failed to capture snapshot');
    }
  };

  // Zoom step action
  const handleStepZoom = () => {
    const controls = (window as any).__orbitControls;
    if (controls) {
      controls.dollyIn(1.25);
      controls.update();
    }
  };

  // Fit view action
  const handleFitView = () => {
    resetCamera();
    toast.info('View centered and framed');
  };

const handleDrop = useCallback(async (e: React.DragEvent) => {
     e.preventDefault(); e.stopPropagation(); setIsDragOver(false);
     
     // Check if it's a file drop
     const file = e.dataTransfer.files[0];
     if (file) {
       const ext = '.' + file.name.split('.').pop()?.toLowerCase();
       if (!SUPPORTED_3D_EXTS.includes(ext)) {
         toast.error(`Unsupported format: ${ext}. Use: ${SUPPORTED_3D_EXTS.join(', ')}`);
         return;
       }
       setIsUploading(true);
       setUploadProgress({ loaded: 0, total: file.size, percent: 0 });
       try {
         const { promise, cancel } = uploadService.uploadWithProgress(
           file,
           (progress) => setUploadProgress(progress),
           '/api/v1/upload/model' as any
         );
         uploadCancelRef.current = cancel;
         const result = await promise;
         if (result?.url) {
           window.dispatchEvent(new CustomEvent('load-glb-model', { detail: { url: result.url } }));
           toast.success(`Model loaded (${ext.slice(1).toUpperCase()})`);
         } else {
           toast.error('Upload succeeded but no URL returned');
         }
       } catch (err: any) {
         if (err.message === 'Upload cancelled') {
           toast.info('Upload cancelled');
         } else {
           toast.error(`Upload failed: ${err?.message || 'Unknown error'}`);
         }
       } finally {
         setIsUploading(false);
         setUploadProgress(null);
         uploadCancelRef.current = null;
       }
       return;
     }
     
     // Check if it's a URL drop (from dragging model asset from asset panel)
     const url = e.dataTransfer.getData('text/plain');
     if (url) {
       // Validate that it's likely a model URL
       if (url.match(/\.(glb|gltf|fbx|obj|stl)$/i)) {
         // Directly load the model from URL without re-uploading
         window.dispatchEvent(new CustomEvent('load-glb-model', { detail: { url } }));
         toast.success('Model loaded from asset panel');
       } else {
         toast.error('Invalid model URL');
       }
       return;
     }
   }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); }, []);
  const handleDragLeave = useCallback(() => setIsDragOver(false), []);

  const materialSpheres = [
    { id: 'default', label: 'PBR Shaded', color: 'from-blue-600 to-indigo-800', border: 'border-blue-400' },
    { id: 'clay', label: 'Matte Clay', color: 'from-slate-400 to-slate-600', border: 'border-slate-300' },
    { id: 'metallic', label: 'Chrome Metal', color: 'from-slate-100 to-zinc-400', border: 'border-zinc-200' },
    { id: 'wireframe', label: 'Wireframe', color: 'from-cyan-900 to-cyan-600', border: 'border-cyan-400' },
    { id: 'normal', label: 'Normal Map', color: 'from-green-400 via-pink-400 to-blue-500', border: 'border-pink-300' },
    { id: 'gold', label: 'Polished Gold', color: 'from-amber-300 to-yellow-600', border: 'border-yellow-300' },
    { id: 'cyberpunk', label: 'Cyberpunk Glow', color: 'from-sky-400 to-blue-700', border: 'border-sky-300' },
    { id: 'uv', label: 'UV Checker', color: 'from-purple-500 to-indigo-700', border: 'border-purple-300' },
  ] as const;

  return (
    <div
      ref={containerRef}
      className="relative flex-1 w-full h-full min-w-0 min-h-0 flex flex-col bg-[radial-gradient(circle_at_50%_35%,#262930_0%,#16181d_60%,#0c0d10_100%)] overflow-hidden select-none"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* 3D Canvas Scene */}
      <ErrorBoundary fallback={<div className="w-full h-full flex items-center justify-center text-[hsl(var(--muted-foreground))]">Canvas error</div>}>
        <Canvas
          key={viewer.fullscreen ? 'fs' : 'normal'}
          camera={{ position: [0, 2, 5.5], fov: 45 }}
          gl={{ preserveDrawingBuffer: true, antialias: true, powerPreference: 'high-performance' }}
          className="w-full h-full"
          style={{ position: 'absolute', inset: 0 }}
        >
          <InnerScene
            shadingMode={shadingMode}
            lightingPreset={lightingPreset}
            activeTool={activeTool}
            onHasModelChange={setHasModelInScene}
            onStatsUpdate={setLiveStats}
          />
        </Canvas>
      </ErrorBoundary>

      {/* Empty Viewport Stage Prompt Overlay */}
      {!hasModelInScene && !isGenerating && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center pointer-events-none pb-24">
          <div className="flex flex-col items-center max-w-sm px-8 py-8 rounded-[2rem] bg-[hsl(var(--surface-2))]/80 backdrop-blur-xl border border-white/5 text-center shadow-[0_20px_50px_rgba(0,0,0,0.5)] pointer-events-auto">
            <div className="w-16 h-16 rounded-2xl bg-[hsl(var(--primary))]/10 border border-[hsl(var(--primary))]/20 flex items-center justify-center text-[hsl(var(--primary))] mb-6 shadow-[inset_0_0_20px_hsl(var(--primary)/0.1)]">
              <Sparkles size={28} />
            </div>
            <h3 className="text-lg font-black text-white mb-2 uppercase tracking-tight">Ready for Generation</h3>
            <p className="text-xs text-white/40 mb-8 leading-relaxed px-4">
              Enter a prompt, upload multi-view images, or drop a 3D file to begin your creation.
            </p>
            <div className="flex items-center gap-2 w-full">
              <label className="flex-1 cursor-pointer flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white text-black text-xs font-black uppercase tracking-widest hover:brightness-90 transition-all shadow-xl active:scale-95">
                <Upload size={14} />
                <span>Upload 3D File</span>
<input
                   type="file"
                   accept=".glb,.gltf,.fbx,.obj,.stl"
                   className="hidden"
                   onChange={async (e) => {
                     const file = e.target.files?.[0];
                     if (!file) return;
                     setIsUploading(true);
                     setUploadProgress({ loaded: 0, total: file.size, percent: 0 });
                     try {
                       const { promise, cancel } = uploadService.uploadWithProgress(
                         file,
                         (progress) => setUploadProgress(progress),
                         '/api/v1/upload/model' as any
                       );
                       uploadCancelRef.current = cancel;
                       const res = await promise;
                       if (res?.url) {
                         window.dispatchEvent(new CustomEvent('load-glb-model', { detail: { url: res.url } }));
                         toast.success('3D model loaded into viewport');
                       }
                     } catch (err: any) {
                       if (err.message === 'Upload cancelled') {
                         toast.info('Upload cancelled');
                       } else {
                         toast.error(`Upload failed: ${err.message}`);
                       }
                     } finally {
                       setIsUploading(false);
                       setUploadProgress(null);
                       uploadCancelRef.current = null;
                     }
                   }}
                 />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────── */}
      {/*  Top Floating Viewport Bar                         */}
      {/* ─────────────────────────────────────────────────── */}
      <div className="absolute top-3 left-4 right-4 z-20 flex items-center justify-between pointer-events-none">
        {/* Project Title (Editable) */}
        <div className="pointer-events-auto flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black/40 backdrop-blur-md border border-white/10 text-white shadow-lg">
          {isEditingTitle ? (
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onBlur={() => setIsEditingTitle(false)}
              onKeyDown={(e) => e.key === 'Enter' && setIsEditingTitle(false)}
              autoFocus
              className="bg-transparent border-b border-[hsl(var(--primary))] text-xs font-bold text-white focus:outline-none w-36"
            />
          ) : (
            <button
              onClick={() => setIsEditingTitle(true)}
              className="flex items-center gap-1.5 text-xs font-semibold text-white/90 hover:text-white transition-colors"
            >
              <span>{projectName}</span>
              <Edit2 size={11} className="text-white/50" />
            </button>
          )}
        </div>

        {/* Center Viewport Tool Pills */}
        <div className="pointer-events-auto flex items-center gap-1 p-1 rounded-xl bg-[hsl(var(--surface-2))]/60 backdrop-blur-md border border-white/5 shadow-xl">
          <button
            onClick={() => setActiveTool('select')}
            className={cn(
              'p-2 rounded-lg transition-all',
              activeTool === 'select' ? 'bg-[hsl(var(--primary))] text-[hsl(var(--surface-2))] shadow-lg' : 'text-white/40 hover:text-white hover:bg-white/5'
            )}
            title="Select tool"
          >
            <MousePointer2 size={14} />
          </button>
          <button
            onClick={() => setActiveTool('orbit')}
            className={cn(
              'p-2 rounded-lg transition-all',
              activeTool === 'orbit' ? 'bg-[hsl(var(--primary))] text-[hsl(var(--surface-2))] shadow-lg' : 'text-white/40 hover:text-white hover:bg-white/5'
            )}
            title="Orbit Camera"
          >
            <RotateCcw size={14} />
          </button>
          <button
            onClick={() => setActiveTool('pan')}
            className={cn(
              'p-2 rounded-lg transition-all',
              activeTool === 'pan' ? 'bg-[hsl(var(--primary))] text-[hsl(var(--surface-2))] shadow-lg' : 'text-white/40 hover:text-white hover:bg-white/5'
            )}
            title="Pan Camera"
          >
            <Move size={14} />
          </button>
          <button
            onClick={handleFitView}
            className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-all"
            title="Frame & Center (Fit)"
          >
            <Focus size={14} />
          </button>
          <button
            onClick={toggleWireframe}
            className={cn(
              'p-2 rounded-lg transition-all',
              viewer.showWireframe ? 'text-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10' : 'text-white/40 hover:text-white hover:bg-white/5'
            )}
            title="Toggle Wireframe"
          >
            <Layers size={14} />
          </button>
        </div>

        {/* Top-Right Real-time Mesh Geometry Stats Badge */}
        <div className="pointer-events-auto flex items-center gap-2">
          {hasModelInScene && liveStats && (
            <div className="hidden sm:flex items-center gap-4 px-4 py-2 rounded-xl bg-[hsl(var(--surface-2))]/60 backdrop-blur-md border border-white/5 text-white text-[10px] shadow-xl">
              <div className="flex flex-col gap-0.5">
                <span className="text-[8px] font-black uppercase text-white/20 tracking-widest">Vertices</span>
                <span className="font-bold text-[hsl(var(--primary))]">{liveStats.vertices.toLocaleString()}</span>
              </div>
              <div className="w-px h-6 bg-white/5" />
              <div className="flex flex-col gap-0.5">
                <span className="text-[8px] font-black uppercase text-white/20 tracking-widest">Polygons</span>
                <span className="font-bold text-sky-400">{liveStats.triangles.toLocaleString()}</span>
              </div>
            </div>
          )}

          {/* 3D Axis Orientation Indicator */}
          <div className="w-10 h-10 rounded-xl bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center relative shadow-lg">
            <span className="text-[9px] font-mono font-bold text-emerald-400 absolute top-1">Y</span>
            <span className="text-[9px] font-mono font-bold text-red-500 absolute right-1">X</span>
            <span className="text-[9px] font-mono font-bold text-sky-400 absolute bottom-1 left-1.5">Z</span>
            <div className="w-1.5 h-1.5 rounded-full bg-white/70 shadow-sm" />
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────── */}
      {/*  Right Vertical Floating Tool Stack                 */}
      {/* ─────────────────────────────────────────────────── */}
      <div className="absolute right-4 top-20 z-20 flex flex-col gap-1.5 p-1 rounded-xl bg-black/45 backdrop-blur-md border border-white/10 shadow-xl">
        {/* Lighting button with menu */}
        <div className="relative">
          <button
            onClick={() => setShowLightingMenu(!showLightingMenu)}
            className="p-2.5 rounded-xl text-white/40 hover:text-white hover:bg-white/5 transition-all"
            title="Lighting Environment"
          >
            <Sun size={18} />
          </button>
          {showLightingMenu && (
            <div className="absolute right-full mr-3 top-0 w-40 p-2 rounded-2xl bg-[hsl(var(--surface-2))]/90 backdrop-blur-xl border border-white/5 shadow-2xl flex flex-col gap-1 z-30">
              {(['studio', 'sunset', 'cyberpunk', 'ambient'] as const).map((preset) => (
                <button
                  key={preset}
                  onClick={() => { setLightingPreset(preset); setShowLightingMenu(false); }}
                  className={cn(
                    'px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-left transition-all',
                    lightingPreset === preset ? 'bg-[hsl(var(--primary))] text-[hsl(var(--surface-2))]' : 'text-white/40 hover:bg-white/5 hover:text-white'
                  )}
                >
                  {preset}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Snapshot / Camera capture */}
        <button
          onClick={handleTakeSnapshot}
          className="p-2.5 rounded-xl text-white/40 hover:text-white hover:bg-white/5 transition-all"
          title="Take HD Snapshot"
        >
          <Camera size={18} />
        </button>

        {/* Toggle Grid */}
        <button
          onClick={toggleGrid}
          className={cn(
            'p-2.5 rounded-xl transition-all',
            viewer.showGrid ? 'text-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10' : 'text-white/40 hover:text-white hover:bg-white/5'
          )}
          title="Toggle Ground Grid"
        >
          <Grid3X3 size={18} />
        </button>

        {/* Shortcuts / Help */}
        <button
          onClick={() => toast.info('Viewport Controls: Left-Click = Orbit, Right-Click = Pan, Scroll = Zoom')}
          className="p-2.5 rounded-xl text-white/40 hover:text-white hover:bg-white/5 transition-all"
          title="Controls Guide"
        >
          <HelpCircle size={18} />
        </button>
      </div>

      {/* ─────────────────────────────────────────────────── */}
      {/*  Center-Bottom Toolbars (Floating Overlay)           */}
      {/* ─────────────────────────────────────────────────── */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2.5 max-w-[95%]">
        {/* Upper Floating Material / Shading Preset Spheres Bar */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-xl border border-white/15 shadow-2xl transition-all hover:border-white/25">
          {materialSpheres.map((s) => (
            <button
              key={s.id}
              onClick={() => setShadingMode(s.id as ShadingPreset)}
              title={`Shading: ${s.label}`}
              className={cn(
                'relative w-6 h-6 rounded-full bg-gradient-to-br transition-all duration-200 transform hover:scale-110 flex items-center justify-center',
                s.color,
                shadingMode === s.id
                  ? 'ring-2 ring-[hsl(var(--primary))] ring-offset-2 ring-offset-black scale-110 shadow-lg'
                  : 'opacity-70 hover:opacity-100'
              )}
            >
              {shadingMode === s.id && <div className="w-1.5 h-1.5 rounded-full bg-white shadow-sm" />}
            </button>
          ))}

          <div className="w-px h-4 bg-white/20 mx-0.5" />

          <button
            onClick={() => setShowShadingMenu(!showShadingMenu)}
            className="p-1 text-white/60 hover:text-white transition-colors"
            title="More Shading Options"
          >
            <ChevronDown size={14} />
          </button>
        </div>

        {/* Lower Main Viewport 10-Tool Navigation Bar */}
        <div className="flex items-center gap-1 px-2 py-2 rounded-[1.5rem] bg-[hsl(var(--surface-2))]/60 backdrop-blur-xl border border-white/5 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
          {/* 1. Select */}
          <button
            onClick={() => { setActiveTool('select'); toast.info('Selection mode active'); }}
            className={cn(
              'flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all',
              activeTool === 'select'
                ? 'bg-[hsl(var(--primary))] text-[hsl(var(--surface-2))] shadow-lg'
                : 'text-white/40 hover:text-white hover:bg-white/5'
            )}
          >
            <MousePointer2 size={16} />
            <span className="text-[9px] font-black uppercase tracking-widest">Select</span>
          </button>

          {/* 2. Orbit */}
          <button
            onClick={() => setActiveTool('orbit')}
            className={cn(
              'flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all',
              activeTool === 'orbit'
                ? 'bg-[hsl(var(--primary))] text-[hsl(var(--surface-2))] shadow-lg'
                : 'text-white/40 hover:text-white hover:bg-white/5'
            )}
          >
            <RotateCcw size={16} />
            <span className="text-[9px] font-black uppercase tracking-widest">Orbit</span>
          </button>

          {/* 3. Pan */}
          <button
            onClick={() => setActiveTool('pan')}
            className={cn(
              'flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all',
              activeTool === 'pan'
                ? 'bg-[hsl(var(--primary))] text-[hsl(var(--surface-2))] shadow-lg'
                : 'text-white/40 hover:text-white hover:bg-white/5'
            )}
          >
            <Move size={16} />
            <span className="text-[9px] font-black uppercase tracking-widest">Pan</span>
          </button>

          <div className="w-px h-8 bg-white/5 mx-1" />

          {/* 6. Auto Rotate */}
          <button
            onClick={toggleAutoRotate}
            className={cn(
              'flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all',
              viewer.autoRotate
                ? 'text-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10'
                : 'text-white/40 hover:text-white hover:bg-white/5'
            )}
          >
            <Play size={16} className={viewer.autoRotate ? 'fill-current' : ''} />
            <span className="text-[9px] font-black uppercase tracking-widest">Auto Rotate</span>
          </button>

          {/* 7. Wireframe */}
          <button
            onClick={toggleWireframe}
            className={cn(
              'flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all',
              viewer.showWireframe
                ? 'text-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10'
                : 'text-white/40 hover:text-white hover:bg-white/5'
            )}
          >
            <Layers size={16} />
            <span className="text-[9px] font-black uppercase tracking-widest">Wireframe</span>
          </button>

          {/* 9. Stats */}
          <button
            onClick={toggleStats}
            className={cn(
              'flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all',
              viewer.showStats
                ? 'text-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10'
                : 'text-white/40 hover:text-white hover:bg-white/5'
            )}
          >
            <BarChart3 size={16} />
            <span className="text-[9px] font-black uppercase tracking-widest">Stats</span>
          </button>
        </div>
      </div>

      {/* Drag & Drop Overlays */}
      {isDragOver && (
        <div className="absolute inset-0 z-40 bg-[hsl(var(--primary))/0.1] border-2 border-dashed border-[hsl(var(--primary))] flex items-center justify-center backdrop-blur-sm transition-all animate-pulse">
          <GlowRing className="rounded-2xl">
            <div className="flex flex-col items-center gap-2 bg-black/90 px-8 py-8 rounded-2xl border border-white/20">
              <Upload size={34} className="text-[hsl(var(--primary))]" />
              <span className="text-sm font-bold text-white">Drop 3D Model Here</span>
              <span className="text-[10px] text-white/60">GLB, GLTF, FBX, OBJ, STL</span>
            </div>
          </GlowRing>
        </div>
      )}

{isUploading && (
         <div className="absolute inset-0 z-30 bg-black/70 backdrop-blur-sm flex items-center justify-center">
           <div className="flex flex-col items-center gap-4">
             {uploadProgress ? (
               <>
                 <div className="flex items-center justify-between mb-2">
                   <span className="text-[9px] font-mono text-white/70">Uploading...</span>
                   <span className="text-[9px] font-mono text-white">{uploadProgress.percent}%</span>
                 </div>
                 <div className="w-full h-1.5 bg-[hsl(var(--surface-3))] rounded-full overflow-hidden">
                   <div
                     className="h-full bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--neon-cyan))] rounded-full transition-all duration-300"
                     style={{ width: `${uploadProgress.percent}%` }}
                   />
                 </div>
                 <button
                   onClick={() => {
                     uploadCancelRef.current?.();
                     setIsUploading(false);
                     setUploadProgress(null);
                     uploadCancelRef.current = null;
                     toast.info('Upload cancelled');
                   }}
                   className="text-[8px] font-mono text-[hsl(var(--muted-foreground))]/50 hover:underline"
                 >
                   Cancel
                 </button>
               </>
             ) : (
               <>
                 <Loader2 size={28} className="text-[hsl(var(--primary))] animate-spin" />
                 <span className="text-xs font-bold text-white">Uploading 3D Model...</span>
               </>
             )}
           </div>
         </div>
       )}

      {isGenerating && (
        <div className="absolute inset-0 z-20 bg-black/50 backdrop-blur-[2px] flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-3 bg-black/80 px-6 py-4 rounded-2xl border border-white/15 shadow-2xl">
            <Loader2 size={24} className="text-[hsl(var(--primary))] animate-spin" />
            <span className="text-xs font-bold text-white">Generating 3D Mesh...</span>
          </div>
        </div>
      )}

      {viewer.showStats && <Stats className="!absolute !bottom-24 !left-4 !z-50" />}
    </div>
  );
}
