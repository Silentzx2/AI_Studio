"use client";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * File 2 — 3D Canvas
 * Complete center 3D workspace: viewer, toolbar, drag-drop, empty/loading/error states
 */

import React, { useRef, useEffect, useState, useCallback, Suspense } from 'react';
import { Canvas, useThree, useLoader } from '@react-three/fiber';
import {
  OrbitControls, Grid, Environment, Center, Html, useProgress,
  Preload, useGLTF, Stats
} from '@react-three/drei';
import { Mesh, Group, Box3, Vector3 } from 'three';
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
  Box, ToggleLeft, BarChart3, Sun, Camera, Upload, Loader2, AlertCircle,
  Minimize2, Expand
} from 'lucide-react';

/* ─────────────────────────────────────────────────── */
/*  Three.js cleanup                                                   */
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
/*  Canvas inner components                                           */
/* ─────────────────────────────────────────────────── */

function CanvasLoadingScreen() {
  const { progress } = useProgress();
  return (
    <Html center>
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-2 border-[hsl(var(--neon-purple)/0.3)] border-t-[hsl(var(--neon-purple))] rounded-full animate-spin" />
        <p className="text-xs text-[hsl(var(--muted-foreground))] font-mono">{progress.toFixed(0)}%</p>
      </div>
    </Html>
  );
}

// ponytail: react-three-fiber measures its container once; when the container
// resizes (fullscreen toggle, flex re-layout) the drawing buffer can keep the
// old size and the view ends up clipped/offset at the top. This keeps the
// renderer sized to its wrapper on every resize. Ceiling: no debounce, fires on
// each resize tick (cheap for a single canvas).
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
  groupRef.current.userData.initialPosition = groupRef.current.position.clone();
  const fov = camera.fov ?? 45;
  const distance = (maxDim / 2 / Math.tan((fov * Math.PI) / 360)) * 1.6;
  camera.position.set(0, size.y * 0.5 + maxDim * 0.2, distance);
  camera.lookAt(0, size.y * 0.5, 0);
  if (controls) { controls.target.set(0, size.y * 0.5, 0); controls.update(); }
}

function setWireframe(obj: any, wireframe: boolean) {
  if (obj.isMesh && obj.material) (obj.material as any).wireframe = wireframe;
}

function GLBModel({ url, wireframe }: { url: string; wireframe: boolean }) {
  const { scene } = useGLTF(url);
  const groupRef = useRef<Group>(null);
  const { camera } = useThree();
  useEffect(() => {
    if (!groupRef.current) return;
    groupRef.current.traverse((c) => setWireframe(c, wireframe));
    frameModel(groupRef, camera, (window as any).__orbitControls);
  }, [wireframe, scene, camera]);
  return <group ref={groupRef}><primitive object={scene} /></group>;
}

function FbxModel({ url, wireframe }: { url: string; wireframe: boolean }) {
  const obj = useLoader(FBXLoader, url);
  const groupRef = useRef<Group>(null);
  const { camera } = useThree();
  useEffect(() => {
    if (!groupRef.current) return;
    groupRef.current.traverse((c) => setWireframe(c, wireframe));
    frameModel(groupRef, camera, (window as any).__orbitControls);
  }, [wireframe, obj, camera]);
  useEffect(() => () => { if (groupRef.current) disposeObject(groupRef.current); }, []);
  return <group ref={groupRef}><primitive object={obj} /></group>;
}

function ObjModel({ url, wireframe }: { url: string; wireframe: boolean }) {
  const obj = useLoader(OBJLoader, url);
  const groupRef = useRef<Group>(null);
  const { camera } = useThree();
  useEffect(() => {
    if (!groupRef.current) return;
    groupRef.current.traverse((c) => setWireframe(c, wireframe));
    frameModel(groupRef, camera, (window as any).__orbitControls);
  }, [wireframe, obj, camera]);
  useEffect(() => () => { if (groupRef.current) disposeObject(groupRef.current); }, []);
  return <group ref={groupRef}><primitive object={obj} /></group>;
}

function StlModel({ url, wireframe }: { url: string; wireframe: boolean }) {
  const geometry = useLoader(STLLoader, url);
  const groupRef = useRef<Group>(null);
  const { camera } = useThree();
  useEffect(() => {
    if (!groupRef.current) return;
    groupRef.current.traverse((c) => setWireframe(c, wireframe));
    frameModel(groupRef, camera, (window as any).__orbitControls);
  }, [wireframe, geometry, camera]);
  useEffect(() => () => { if (groupRef.current) disposeObject(groupRef.current); }, []);
  return (
    <group ref={groupRef}>
      <mesh geometry={geometry}><meshStandardMaterial color="#cccccc" wireframe={wireframe} /></mesh>
    </group>
  );
}

function CameraController({ autoRotate }: { autoRotate: boolean }) {
  const { camera } = useThree();
  const orbitRef = useRef<any>(null);
  useEffect(() => { registerResetCamera(() => { if (orbitRef.current) orbitRef.current.reset(); camera.position.set(0, 3, 6); }); }, [camera]);
  useEffect(() => {
    (window as any).__orbitControls = orbitRef.current;
    return () => { if ((window as any).__orbitControls === orbitRef.current) (window as any).__orbitControls = null; };
  }, []);
  return <OrbitControls ref={orbitRef} autoRotate={autoRotate} autoRotateSpeed={1.5} enableDamping dampingFactor={0.08} minDistance={1.5} maxDistance={15} makeDefault />;
}

function SceneGrid({ visible }: { visible: boolean }) {
  const accentColor = useThemeStore((s) => s.accentColor);
  if (!visible) return null;
  return <Grid position={[0, -1.8, 0]} args={[20, 20]} cellSize={0.5} cellThickness={0.5} cellColor={accentColor} sectionSize={2.5} sectionThickness={1} sectionColor={accentColor} fadeDistance={20} fadeStrength={1} infiniteGrid />;
}

function EmptyStateIndicator() {
  return (
    <Html center>
      <div className="flex flex-col items-center gap-4 pointer-events-none select-none">
        <div className="w-20 h-20 rounded-2xl bg-[hsl(var(--surface-2))/0.5] border border-dashed border-[hsl(var(--border)/0.5)] flex items-center justify-center">
          <Upload size={30} className="text-[hsl(var(--muted-foreground))]/40" />
        </div>
        <div className="text-center">
          <p className="text-sm font-bold text-[hsl(var(--muted-foreground))/80]">Drag &amp; drop karke upload karo</p>
          <p className="text-[11px] text-[hsl(var(--muted-foreground))/45 mt-1.5">GLB, GLTF, FBX, OBJ ya STL file yahan drop karein</p>
        </div>
      </div>
    </Html>
  );
}

function ErrorIndicator() {
  return (
    <Html center>
      <div className="flex flex-col items-center gap-3 pointer-events-none select-none">
        <AlertCircle size={32} className="text-[hsl(var(--destructive))/60" />
        <p className="text-xs font-bold text-[hsl(var(--destructive))/70]">Failed to load model</p>
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

function InnerScene() {
  const { viewer } = useUIStore();
  const { currentJob } = useGenerationStore();
  const hasModel = currentJob?.status === 'completed' && currentJob.result;
  const modelUrl = currentJob?.result?.downloadUrls?.glb || currentJob?.result?.modelUrl;
  const [userModelUrl, setUserModelUrl] = useState<string | null>(null);
  const [modelError, setModelError] = useState(false);

  // Listen for load-glb-model events (dispatched by asset selection, model uploads, etc.)
  // URLs here must be real backend URLs — never blob URLs.
  const handleLoadGlb = useCallback((e: CustomEvent) => {
    const url: string = e.detail?.url;
    if (!url) return;
    // Only revoke blob:// URLs (legacy safety); real backend URLs must not be revoked.
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
      // Cleanup: revoke any blob URL on unmount
      setUserModelUrl((prev) => {
        if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [handleLoadGlb]);

  const getExt = (url: string) => { const m = url.match(/\.([^.]+)$/); return m ? m[1].toLowerCase() : ''; };

  const renderModel = (url: string) => {
    const ext = getExt(url);
    return (
      <ErrorBoundary fallback={<ErrorIndicator />} onError={() => setModelError(true)}>
        <Suspense fallback={<CanvasLoadingScreen />}>
          {(ext === 'glb' || ext === 'gltf')
            ? <GLBModel url={url} wireframe={viewer.showWireframe} />
            : ext === 'fbx' ? <FbxModel url={url} wireframe={viewer.showWireframe} />
            : ext === 'obj' ? <ObjModel url={url} wireframe={viewer.showWireframe} />
            : ext === 'stl' ? <StlModel url={url} wireframe={viewer.showWireframe} />
            : <EmptyStateIndicator />}
        </Suspense>
      </ErrorBoundary>
    );
  };

  const showModel = (userModelUrl || (hasModel && modelUrl)) && !modelError;

  return (
    <>
      <CameraController autoRotate={viewer.autoRotate} />
      {/* ponytail: studio 3-point lighting for a clean, depth-rich look on the
          dark canvas. Concrete hex colors (not CSS-var strings) so three.js
          Color parses them reliably. */}
      <ambientLight intensity={0.45} />
      <directionalLight position={[6, 10, 8]} intensity={2.1} color="#ffffff" castShadow />
      <directionalLight position={[-8, 5, -4]} intensity={1.1} color="#bcd4ff" />
      <directionalLight position={[0, 4, -10]} intensity={0.9} color="#ffd9a8" />
      <pointLight position={[-4, 2, 6]} intensity={0.5} color="#f5a623" />
        {/* ponytail: studio HDR is fetched from a CDN; if it stalls the whole
            canvas suspends on the loader forever. Isolate it so a slow/offline
            env download can never block the scene (falls back to the lights below). */}
        <Suspense fallback={null}>
          <Environment preset="studio" />
        </Suspense>
        <Center>
        {showModel
          ? (userModelUrl ? renderModel(userModelUrl) : modelUrl ? renderModel(modelUrl) : <EmptyStateIndicator />)
          : <EmptyStateIndicator />}
      </Center>
      <SceneGrid visible={viewer.showGrid} />
      <CanvasResizeSync />
      <Preload all />
    </>
  );
}

/* ─────────────────────────────────────────────────── */
/*  Toolbar button                                                     */
/* ─────────────────────────────────────────────────── */

interface ToolBtnProps {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  active?: boolean;
  disabled?: boolean;
  label: string;
  onClick?: () => void;
}

function ToolBtn({ icon: Icon, active, disabled, label, onClick }: ToolBtnProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={cn(
        'p-1.5 rounded-lg transition-all duration-150',
        active
          ? 'bg-[hsl(var(--primary))/0.15] text-[hsl(var(--primary))] border border-[hsl(var(--primary))/0.3]'
          : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))] border border-transparent',
        disabled && 'opacity-30 pointer-events-none'
      )}
    >
      <Icon size={14} />
    </button>
  );
}

/* ─────────────────────────────────────────────────── */
/*  Main Canvas3D Export                                               */
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

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!SUPPORTED_3D_EXTS.includes(ext)) {
      toast.error(`Unsupported format: ${ext}. Use: ${SUPPORTED_3D_EXTS.join(', ')}`);
      return;
    }
    setIsUploading(true);
    try {
      const result = await uploadService.uploadWithProgress(file, () => {}, '/api/v1/upload/model' as any);
      // Use the real persistent URL from the backend response
      if (result?.url) {
        window.dispatchEvent(new CustomEvent('load-glb-model', { detail: { url: result.url } }));
        toast.success(`Model uploaded (${ext.slice(1).toUpperCase()})`);
      } else {
        toast.error('Upload succeeded but no URL returned');
      }
    } catch (err: any) {
      toast.error(`Upload failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsUploading(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); }, []);
  const handleDragLeave = useCallback(() => setIsDragOver(false), []);

/* Fullscreen mode */
   if (viewer.fullscreen) {
     return (
       <div ref={containerRef} className="fixed inset-0 z-50 bg-[radial-gradient(circle_at_50%_30%,#3a3e46_0%,#26282e_55%,#16181c_100%)]"
         onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}>
         <ErrorBoundary fallback={<div className="w-full h-full flex items-center justify-center text-[hsl(var(--muted-foreground))]">Canvas error</div>}>
           <Canvas key={viewer.fullscreen ? 'fs' : 'normal'} camera={{ position: [0, 3, 6], fov: 45 }} gl={{ preserveDrawingBuffer: true, antialias: true }} className="w-full h-full" style={{ position: 'absolute', inset: 0 }}>
             <InnerScene />
           </Canvas>
         </ErrorBoundary>
         
         {/* Drag/Drop Indicators - same as normal mode */}
         {isDragOver && (
           <div className="absolute inset-0 z-40 bg-[hsl(var(--primary))/0.08] border-2 border-dashed border-[hsl(var(--primary))/0.5] flex items-center justify-center backdrop-blur-sm transition-all animate-pulse">
             <GlowRing className="rounded-2xl">
               <div className="flex flex-col items-center gap-2 bg-[hsl(var(--surface-1))/0.92] px-7 py-7 rounded-2xl">
                 <Upload size={30} className="text-[hsl(var(--primary))]" />
                 <span className="text-xs font-bold text-[hsl(var(--primary))]">Drop 3D model here</span>
                 <span className="text-[9px] text-[hsl(var(--muted-foreground))]">GLB, GLTF, FBX, OBJ, STL</span>
               </div>
             </GlowRing>
           </div>
         )}

         {isUploading && (
           <div className="absolute inset-0 z-30 bg-[hsl(var(--surface-0))/0.7] backdrop-blur-sm flex items-center justify-center">
             <div className="flex flex-col items-center gap-3">
               <Loader2 size={24} className="text-[hsl(var(--primary))] animate-spin" />
               <span className="text-xs font-bold text-[hsl(var(--foreground))]">Uploading model...</span>
             </div>
           </div>
         )}

         {isGenerating && (
           <div className="absolute inset-0 z-20 bg-[hsl(var(--surface-0))/0.5] backdrop-blur-[2px] flex items-center justify-center pointer-events-none">
             <div className="flex flex-col items-center gap-3">
               <Loader2 size={24} className="text-[hsl(var(--primary))] animate-spin" />
               <span className="text-xs font-bold text-[hsl(var(--foreground))]">Generating...</span>
             </div>
           </div>
         )}
         
         <button onClick={toggleFullscreen} className="absolute top-4 right-4 z-50 p-2 rounded-lg bg-[hsl(var(--surface-1))/0.8] backdrop-blur border border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))] transition-all">
           <Minimize2 size={16} />
         </button>
         <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 p-1.5 rounded-xl bg-[hsl(var(--surface-1))/0.8] backdrop-blur border border-[hsl(var(--border))]">
           <ToolBtn icon={RotateCcw} label="Reset Camera" onClick={resetCamera} />
           <ToolBtn icon={Grid3X3} active={viewer.showGrid} label="Grid" onClick={toggleGrid} />
           <ToolBtn icon={ToggleLeft} active={viewer.showWireframe} label="Wireframe" onClick={toggleWireframe} />
           <ToolBtn icon={RotateCcw} active={viewer.autoRotate} label="Auto Rotate" onClick={toggleAutoRotate} />
           <ToolBtn icon={BarChart3} active={viewer.showStats} label="Stats" onClick={toggleStats} />
         </div>
         {viewer.showStats && <Stats className="!absolute !bottom-16 !left-4 !z-50" />}
       </div>
     );
   }

  /* Normal mode */
  return (
    <div ref={containerRef}
      className="relative flex-1 min-w-0 min-h-0 bg-[radial-gradient(circle_at_50%_30%,#3a3e46_0%,#26282e_55%,#16181c_100%)] overflow-hidden"
      onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}
    >
      <ErrorBoundary fallback={<div className="w-full h-full flex items-center justify-center text-[hsl(var(--muted-foreground))]">Canvas error</div>}>
        <Canvas key={viewer.fullscreen ? 'fs' : 'normal'} camera={{ position: [0, 3, 6], fov: 45 }} gl={{ preserveDrawingBuffer: true, antialias: true }} className="w-full h-full" style={{ position: 'absolute', inset: 0 }}>
          <InnerScene />
        </Canvas>
        </ErrorBoundary>

      {isDragOver && (
        <div className="absolute inset-0 z-40 bg-[hsl(var(--primary))/0.08] border-2 border-dashed border-[hsl(var(--primary))/0.5] flex items-center justify-center backdrop-blur-sm transition-all animate-pulse">
          <GlowRing className="rounded-2xl">
            <div className="flex flex-col items-center gap-2 bg-[hsl(var(--surface-1))/0.92] px-7 py-7 rounded-2xl">
              <Upload size={30} className="text-[hsl(var(--primary))]" />
              <span className="text-xs font-bold text-[hsl(var(--primary))]">Drop 3D model here</span>
              <span className="text-[9px] text-[hsl(var(--muted-foreground))]">GLB, GLTF, FBX, OBJ, STL</span>
            </div>
          </GlowRing>
        </div>
      )}

      {isUploading && (
        <div className="absolute inset-0 z-30 bg-[hsl(var(--surface-0))/0.7] backdrop-blur-sm flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={24} className="text-[hsl(var(--primary))] animate-spin" />
            <span className="text-xs font-bold text-[hsl(var(--foreground))]">Uploading model...</span>
          </div>
        </div>
      )}

      {isGenerating && (
        <div className="absolute inset-0 z-20 bg-[hsl(var(--surface-0))/0.5] backdrop-blur-[2px] flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={24} className="text-[hsl(var(--primary))] animate-spin" />
            <span className="text-xs font-bold text-[hsl(var(--foreground))]">Generating...</span>
          </div>
        </div>
      )}

      <div className="absolute top-3 right-3 z-10 flex flex-col gap-1 p-1.5 rounded-xl bg-[hsl(var(--surface-1))/0.6] backdrop-blur-md border border-[hsl(var(--border)/0.5)]">
        <ToolBtn icon={Sun} label="Lighting" disabled />
        <ToolBtn icon={Camera} label="Screenshot" disabled />
        <ToolBtn icon={Grid3X3} active={viewer.showGrid} label="Grid" onClick={toggleGrid} />
        <ToolBtn icon={Expand} label="Fullscreen" onClick={toggleFullscreen} />
      </div>

      <div className="absolute bottom-3 left-3 right-3 z-10 flex items-center gap-1 p-1.5 rounded-xl bg-[hsl(var(--surface-1))/0.6] backdrop-blur-md border border-[hsl(var(--border)/0.5)]">
        <ToolBtn icon={MousePointer2} active label="Select (not implemented)" disabled />
        <ToolBtn icon={RotateCcw} active label="Orbit" disabled />
        <ToolBtn icon={Move} label="Pan" disabled />
        <ToolBtn icon={ZoomIn} label="Zoom" disabled />
        <div className="w-px h-5 bg-[hsl(var(--border)/0.5)] mx-0.5" />
        <ToolBtn icon={RotateCcw} label="Reset View" onClick={resetCamera} />
        <ToolBtn icon={RotateCcw} active={viewer.autoRotate} label="Auto Rotate" onClick={toggleAutoRotate} />
        <ToolBtn icon={ToggleLeft} active={viewer.showWireframe} label="Wireframe" onClick={toggleWireframe} />
        <ToolBtn icon={Grid3X3} active={viewer.showGrid} label="Grid" onClick={toggleGrid} />
        <ToolBtn icon={BarChart3} active={viewer.showStats} label="Stats" onClick={toggleStats} />
        <div className="flex-1" />
        <ToolBtn icon={Expand} label="Fullscreen" onClick={toggleFullscreen} />
      </div>

      {viewer.showStats && <Stats className="!absolute !bottom-16 !left-3 !z-10" />}
    </div>
  );
}
