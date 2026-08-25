import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { 
  Hand, 
  Camera, 
  Grid as GridIcon, 
  HelpCircle, 
  RotateCcw, 
  RotateCw, 
  Maximize, 
  Printer, 
  Download, 
  ChevronDown, 
  Sparkles, 
  RefreshCw, 
  Eye, 
  Layers,
  Compass,
  Check,
  UploadCloud,
  Box
} from 'lucide-react';
import { useWorkspace } from '../store/WorkspaceContext';
import { ShadingMode, CameraViewPreset, ModelAsset } from '../types';

interface MeshViewerProps {
  className?: string;
  showOverlayUI?: boolean;
}

export const MeshViewer: React.FC<MeshViewerProps> = ({ 
  className = '', 
  showOverlayUI = true 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { 
    assets,
    currentAsset, 
    setCurrentAsset,
    selectAsset,
    addAsset,
    shadingMode, 
    setShadingMode,
    isTurntable,
    setIsTurntable,
    isExecuting,
    executionProgress,
    activeTool,
    setIsExportModalOpen,
    generate3DModel
  } = useWorkspace();

  const [isLoading, setIsLoading] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [cameraPreset, setCameraPreset] = useState<CameraViewPreset>('perspective');
  const [cameraMenuOpen, setCameraMenuOpen] = useState(false);
  const [interactionMode, setInteractionMode] = useState<'orbit' | 'pan'>('orbit');
  const [isDragOver, setIsDragOver] = useState(false);
  const [dropToastMessage, setDropToastMessage] = useState<string | null>(null);

  // Internal Three.js references
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const currentMeshGroupRef = useRef<THREE.Group | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const isTurntableRef = useRef(isTurntable);

  // Keep turntable ref in sync with prop
  useEffect(() => {
    isTurntableRef.current = isTurntable;
  }, [isTurntable]);

  // Initialize Three.js Scene once
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f1015);
    sceneRef.current = scene;

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 1.2, 3.8);
    cameraRef.current = camera;

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({ 
      antialias: true, 
      alpha: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.maxDistance = 25;
    controls.minDistance = 0.8;
    controls.target.set(0, 0.4, 0);
    controlsRef.current = controls;

    // 5. Lighting Setup (Studio 3-Point Setup)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const mainKeyLight = new THREE.DirectionalLight(0xfff5ea, 2.2);
    mainKeyLight.position.set(4, 6, 5);
    mainKeyLight.castShadow = true;
    mainKeyLight.shadow.mapSize.width = 2048;
    mainKeyLight.shadow.mapSize.height = 2048;
    mainKeyLight.shadow.bias = -0.0001;
    scene.add(mainKeyLight);

    const fillLight = new THREE.DirectionalLight(0x90b0ff, 1.2);
    fillLight.position.set(-5, 3, -3);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xfff0d0, 1.8);
    rimLight.position.set(0, 5, -6);
    scene.add(rimLight);

    // 6. Floor Grid and Soft Shadow Floor
    const grid = new THREE.GridHelper(10, 20, 0x303644, 0x1a1e28);
    grid.position.y = -0.65;
    scene.add(grid);
    gridHelperRef.current = grid;

    const floorGeo = new THREE.PlaneGeometry(15, 15);
    const floorMat = new THREE.ShadowMaterial({ opacity: 0.35 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.651;
    floor.receiveShadow = true;
    scene.add(floor);

    // 7. Mesh Root Container Group
    const meshGroup = new THREE.Group();
    scene.add(meshGroup);
    currentMeshGroupRef.current = meshGroup;

    // 8. Animation & Render Loop
    const timer = new THREE.Timer();
    const animate = () => {
      animFrameIdRef.current = requestAnimationFrame(animate);
      timer.update();
      const delta = timer.getDelta();

      if (isTurntableRef.current && meshGroup) {
        meshGroup.rotation.y += delta * 0.45;
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // 9. Resize Handling via ResizeObserver
    const resizeObserver = new ResizeObserver(() => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w > 0 && h > 0) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Update Turntable status
  useEffect(() => {
    // handled in loop via isTurntableActive
  }, [isTurntable]);

  // Update Grid visibility
  useEffect(() => {
    if (gridHelperRef.current) {
      gridHelperRef.current.visible = showGrid;
    }
  }, [showGrid]);

  // Load the real selected asset into the persistent viewport.
  useEffect(() => {
    if (!sceneRef.current || !currentMeshGroupRef.current) return;
    const group = currentMeshGroupRef.current;
    while (group.children.length > 0) {
      const obj = group.children[0];
      group.remove(obj);
      obj.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose();
          const material = child.material;
          if (Array.isArray(material)) material.forEach(m => m.dispose());
          else material?.dispose();
        }
      });
    }

    if (!currentAsset?.source?.viewUrl && !currentAsset?.source?.localUrl) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    const load = async () => {
      setIsLoading(true);
      try {
        const sourceUrl = currentAsset.source?.localUrl || currentAsset.source?.viewUrl;
        if (!sourceUrl) return;

        const format = currentAsset.format.toLowerCase();
        if (format === 'glb' || format === 'gltf') {
          const loader = new GLTFLoader();
          const gltf = await loader.loadAsync(sourceUrl);
          if (!cancelled) {
            group.add(gltf.scene);
            gltf.scene.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
              }
            });
          }
        } else if (format === 'obj') {
          const loader = new OBJLoader();
          const object = await loader.loadAsync(sourceUrl);
          if (!cancelled) {
            object.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                if (shadingMode === 'wireframe') {
                  child.material = new THREE.MeshStandardMaterial({
                    color: 0xd0d5dc,
                    wireframe: true,
                    roughness: 0.75,
                    metalness: 0.05
                  });
                }
              }
            });
            group.add(object);
          }
        } else if (format === 'ply') {
          const response = await fetch(sourceUrl);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const buffer = await response.arrayBuffer();
          const loader = new PLYLoader();
          const geometry = loader.parse(buffer);
          geometry.computeVertexNormals();
          const material = new THREE.MeshStandardMaterial({
            color: 0xbcc2cc,
            roughness: 0.82,
            metalness: 0.05,
            wireframe: shadingMode === 'wireframe'
          });
          const mesh = new THREE.Mesh(geometry, material);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          group.add(mesh);
        } else {
          throw new Error(`No browser preview is available for ${currentAsset.format}.`);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Viewport asset load failed', error);
          setDropToastMessage(error instanceof Error ? error.message : 'Unable to preview asset');
          window.setTimeout(() => setDropToastMessage(null), 4000);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [currentAsset?.id, currentAsset?.source?.viewUrl, currentAsset?.source?.localUrl, currentAsset?.format, shadingMode]);

  // Camera preset switcher
  const applyCameraPreset = useCallback((preset: CameraViewPreset) => {
    if (!cameraRef.current || !controlsRef.current) return;
    setCameraPreset(preset);
    setCameraMenuOpen(false);
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    ctrl.target.set(0, 0.4, 0);

    switch (preset) {
      case 'perspective':
        cam.position.set(0, 1.2, 3.8);
        break;
      case 'front':
        cam.position.set(0, 0.4, 4.0);
        break;
      case 'back':
        cam.position.set(0, 0.4, -4.0);
        break;
      case 'top':
        cam.position.set(0, 4.2, 0.01);
        break;
      case 'bottom':
        cam.position.set(0, -3.8, 0.01);
        break;
      case 'left':
        cam.position.set(-4.0, 0.4, 0);
        break;
      case 'right':
        cam.position.set(4.0, 0.4, 0);
        break;
      case 'ortho':
        cam.position.set(2.8, 2.0, 2.8);
        break;
    }
    ctrl.update();
  }, []);

  const resetCamera = useCallback(() => {
    applyCameraPreset('perspective');
  }, [applyCameraPreset]);

  // Take screenshot
  const handleScreenshot = () => {
    if (!rendererRef.current) return;
    const dataUrl = rendererRef.current.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${(currentAsset?.name || 'asset').toLowerCase()}_preview.png`;
    a.click();
  };

  // Drag and drop asset loading handler
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    // 1. Check if dropped from Assets library
    const assetJson = e.dataTransfer.getData('application/json');
    const assetId = e.dataTransfer.getData('text/plain');

    if (assetJson) {
      try {
        const droppedAsset: ModelAsset = JSON.parse(assetJson);
        setCurrentAsset(droppedAsset);
        setDropToastMessage(`Loaded "${droppedAsset.name}" into Viewport`);
        setTimeout(() => setDropToastMessage(null), 3000);
        return;
      } catch (err) {
        // Fallback to ID
      }
    }

    if (assetId) {
      const match = assets.find(a => a.id === assetId);
      if (match) {
        setCurrentAsset(match);
        setDropToastMessage(`Loaded "${match.name}" into Viewport`);
        setTimeout(() => setDropToastMessage(null), 3000);
        return;
      }
    }

    // 2. Check if local 3D files were dropped from desktop (OBJ, GLB, STL, FBX)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      const ext = file.name.split('.').pop()?.toUpperCase() || 'GLB';
      const cleanName = file.name.replace(/\.[^/.]+$/, "");

      const customAsset: ModelAsset = {
        id: `dropped-file-${Date.now()}`,
        name: cleanName,
        category: 'mesh',
        meshType: 'custom',
        thumbnail: '',
        faces: 0,
        vertices: 0,
        triangles: 0,
        statsAvailable: false,
        topology: 'Quad',
        format: ext === 'OBJ' ? 'OBJ' : ext === 'PLY' ? 'PLY' : 'GLB',
        dateCreated: new Date().toISOString().split('T')[0],
        tags: ['Local Import', '3D Model', ext],
        source: { filename: file.name, subfolder: '', type: 'input', localUrl: URL.createObjectURL(file) }
      };

      addAsset(customAsset);
      setCurrentAsset(customAsset);
      setDropToastMessage(`Imported and loaded "${cleanName}"`);
      setTimeout(() => setDropToastMessage(null), 3500);
    }
  };

  return (
    <div 
      className={`relative w-full h-full overflow-hidden select-none ${className}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* 3D Canvas Container */}
      <div ref={containerRef} className="w-full h-full absolute inset-0 cursor-grab active:cursor-grabbing" />

      {/* Drag & Drop Visual Dropzone Overlay */}
      {isDragOver && (
        <div className="absolute inset-0 bg-[var(--ws-panel,#0f1015)]/85 border-2 border-dashed border-[#f5c518] backdrop-blur-md flex flex-col items-center justify-center z-40 transition-all pointer-events-none">
          <div className="w-16 h-16 rounded-2xl bg-[#f5c518]/15 border border-[#f5c518]/40 flex items-center justify-center text-[#f5c518] shadow-2xl animate-bounce mb-3">
            <UploadCloud className="w-8 h-8" />
          </div>
          <span className="text-base font-bold text-[var(--ws-text,#f3f4f6)] tracking-wide">
            Drop 3D Asset to Load into Viewport
          </span>
          <span className="text-xs text-[var(--ws-text-muted,#9ca3af)] mt-1">
            Loads geometry, textures, topology & material configs instantly
          </span>
        </div>
      )}

      {/* Drop Notification Toast */}
      {dropToastMessage && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-[var(--ws-dropdown-bg,#181a22)]/95 border border-[#f5c518]/40 backdrop-blur-md shadow-2xl flex items-center gap-2 text-xs font-semibold text-[var(--ws-text,#f3f4f6)] animate-in fade-in slide-in-from-top-2 duration-300">
          <Sparkles className="w-4 h-4 text-[#f5c518]" />
          <span>{dropToastMessage}</span>
        </div>
      )}

      {/* Loading Overlay */}
      {(isLoading || isExecuting) && (
        <div className="absolute inset-0 bg-[var(--ws-panel,#0f1015)]/60 backdrop-blur-sm flex flex-col items-center justify-center z-20 pointer-events-none transition-all">
          <div className="relative flex items-center justify-center">
            <div className="w-14 h-14 rounded-full border-2 border-[var(--ws-border,#2b3140)] border-t-[#f5c518] animate-spin" />
            <Sparkles className="w-5 h-5 text-[#f5c518] absolute" />
          </div>
          <div className="mt-3 text-center">
            <span className="text-xs font-bold text-[var(--ws-text,#f3f4f6)] tracking-wide block">
              {isExecuting ? 'FastAPI 3D Engine Processing...' : 'Compiling 3D Mesh Shaders...'}
            </span>
            {isExecuting && (
              <div className="mt-2 w-44 h-1.5 rounded-full bg-[var(--ws-active-bg,#1e2330)] overflow-hidden">
                <div 
                  className="h-full bg-[#f5c518] transition-all duration-300 rounded-full"
                  style={{ width: `${executionProgress || 45}%` }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Persistent Viewport Overlays (Matching Reference Image) */}
      {showOverlayUI && (
        <>
          {/* Top-Right Topology & Orientation HUD (Reference Image) */}
          <div className="absolute top-4 right-4 z-10 flex items-center gap-3">
            <div className="bg-[var(--ws-hud-bg,#12141a)]/90 backdrop-blur-md border border-[var(--ws-hud-border,#232733)] rounded-xl px-3.5 py-2 shadow-xl space-y-1 text-xs font-mono">
              <div className="flex items-center justify-between gap-4">
                <span className="text-[var(--ws-text-muted,#8e95a5)] text-[11px]">Topology</span>
                <span className="text-[var(--ws-text,#f3f4f6)] font-semibold text-[11px] flex items-center gap-1">
                  {currentAsset?.statsAvailable ? currentAsset.topology : '—'} <ChevronDown className="w-3 h-3 text-[#6b7280]" />
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-[var(--ws-text-muted,#8e95a5)] text-[11px]">Faces</span>
                <span className="text-[#22c55e] font-semibold text-[11px]">
                  {currentAsset?.statsAvailable ? `${currentAsset.faces.toLocaleString()} / ${currentAsset.faces.toLocaleString()}` : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-[var(--ws-text-muted,#8e95a5)] text-[11px]">Vertices</span>
                <span className="text-[#22c55e] font-semibold text-[11px]">
                  {currentAsset?.statsAvailable ? `${currentAsset.vertices.toLocaleString()} / ${currentAsset.vertices.toLocaleString()}` : '—'}
                </span>
              </div>
            </div>

            {/* 3D Axis Orientation Widget / Gizmo */}
            <div 
              onClick={resetCamera}
              className="w-11 h-11 rounded-xl bg-[var(--ws-hud-bg,#12141a)]/90 backdrop-blur-md border border-[var(--ws-hud-border,#232733)] flex items-center justify-center cursor-pointer hover:border-[#f5c518] shadow-xl group transition-all"
              title="Reset Orbit Camera"
            >
              <div className="relative w-6 h-6 flex items-center justify-center">
                <span className="text-[9px] font-bold text-[#ef4444] absolute -top-1">Y</span>
                <span className="text-[9px] font-bold text-[#22c55e] absolute -right-1">X</span>
                <span className="text-[9px] font-bold text-[#3b82f6] absolute -bottom-1">Z</span>
                <div className="w-2 h-2 rounded-full bg-[#f5c518] group-hover:scale-125 transition-transform" />
              </div>
            </div>
          </div>

          {/* Right Floating Tool Rail (Hand, Camera, Grid, Help, Turntable) */}
          <div className="absolute right-4 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-1.5 bg-[var(--ws-hud-bg,#12141a)]/90 backdrop-blur-md border border-[var(--ws-hud-border,#232733)] p-1.5 rounded-2xl shadow-2xl">
            <button
              onClick={() => setInteractionMode(interactionMode === 'orbit' ? 'pan' : 'orbit')}
              title={interactionMode === 'orbit' ? 'Switch to Pan Mode' : 'Switch to Orbit Mode'}
              className={`p-2 rounded-xl transition-all ${
                interactionMode === 'pan' 
                  ? 'bg-[#f5c518] text-[#111216]' 
                  : 'text-[var(--ws-text-muted,#8e95a5)] hover:text-[var(--ws-text,#f3f4f6)] hover:bg-[var(--ws-hover-bg,#1f232e)]'
              }`}
            >
              <Hand className="w-4 h-4" />
            </button>

            <button
              onClick={handleScreenshot}
              title="Capture 3D Viewport Screenshot"
              className="p-2 rounded-xl text-[var(--ws-text-muted,#8e95a5)] hover:text-[var(--ws-text,#f3f4f6)] hover:bg-[var(--ws-hover-bg,#1f232e)] transition-all"
            >
              <Camera className="w-4 h-4" />
            </button>

            <button
              onClick={() => setShowGrid(!showGrid)}
              title={showGrid ? 'Hide Floor Grid' : 'Show Floor Grid'}
              className={`p-2 rounded-xl transition-all ${
                showGrid 
                  ? 'text-[#f5c518] bg-[var(--ws-active-bg,#1a1d26)]' 
                  : 'text-[var(--ws-text-muted,#8e95a5)] hover:text-[var(--ws-text,#f3f4f6)] hover:bg-[var(--ws-hover-bg,#1f232e)]'
              }`}
            >
              <GridIcon className="w-4 h-4" />
            </button>

            <button
              onClick={() => setIsTurntable(!isTurntable)}
              title={isTurntable ? 'Pause Turntable 360°' : 'Start Turntable 360°'}
              className={`p-2 rounded-xl transition-all ${
                isTurntable 
                  ? 'bg-[#f5c518] text-[#111216]' 
                  : 'text-[var(--ws-text-muted,#8e95a5)] hover:text-[var(--ws-text,#f3f4f6)] hover:bg-[var(--ws-hover-bg,#1f232e)]'
              }`}
            >
              <RotateCw className="w-4 h-4" />
            </button>

            <button
              onClick={resetCamera}
              title="Reset Camera (Hotkey: F)"
              className="p-2 rounded-xl text-[var(--ws-text-muted,#8e95a5)] hover:text-[var(--ws-text,#f3f4f6)] hover:bg-[var(--ws-hover-bg,#1f232e)] transition-all"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          {/* Shading Material Swatches Bar (Bottom Center - Exact Match to Screenshot) */}
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-10">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-[var(--ws-hud-bg,#12141a)]/95 backdrop-blur-md border border-[var(--ws-hud-border,#232733)] shadow-2xl">
              {/* Textured / PBR */}
              <button
                onClick={() => setShadingMode('textured')}
                title="PBR Textured"
                className={`w-7 h-7 rounded-full overflow-hidden border-2 transition-transform ${
                  shadingMode === 'textured' ? 'border-[#f5c518] scale-110 shadow-md' : 'border-transparent hover:scale-105'
                }`}
              >
                {currentAsset?.thumbnail ? (
                  <img 
                    src={currentAsset.thumbnail} 
                    alt="Textured" 
                    className="w-full h-full object-cover"
                    crossOrigin="anonymous" 
                  />
                ) : (
                  <div className="w-full h-full bg-[#2a2f3a]" />
                )}
              </button>

              {/* Clay */}
              <button
                onClick={() => setShadingMode('clay')}
                title="Matte Clay"
                className={`w-7 h-7 rounded-full bg-[#8c919d] border-2 transition-transform ${
                  shadingMode === 'clay' ? 'border-[#f5c518] scale-110 shadow-md' : 'border-transparent hover:scale-105'
                }`}
              />

              {/* White Ceramic */}
              <button
                onClick={() => setShadingMode('matcap-ceramic')}
                title="Ceramic Gloss"
                className={`w-7 h-7 rounded-full bg-[#e2e8f0] border-2 transition-transform ${
                  shadingMode === 'matcap-ceramic' ? 'border-[#f5c518] scale-110 shadow-md' : 'border-transparent hover:scale-105'
                }`}
              />

              {/* Chrome Metallic */}
              <button
                onClick={() => setShadingMode('matcap-chrome')}
                title="Chrome Metallic"
                className={`w-7 h-7 rounded-full bg-gradient-to-tr from-[#334155] via-[#94a3b8] to-[#f8fafc] border-2 transition-transform ${
                  shadingMode === 'matcap-chrome' ? 'border-[#f5c518] scale-110 shadow-md' : 'border-transparent hover:scale-105'
                }`}
              />

              {/* Wireframe */}
              <button
                onClick={() => setShadingMode('wireframe')}
                title="Topology Wireframe"
                className={`w-7 h-7 rounded-full bg-[#111827] border-2 flex items-center justify-center text-[10px] text-[#22c55e] transition-transform ${
                  shadingMode === 'wireframe' ? 'border-[#f5c518] scale-110 shadow-md' : 'border-transparent hover:scale-105'
                }`}
              >
                #
              </button>

              {/* Normal Map */}
              <button
                onClick={() => setShadingMode('matcap-normal')}
                title="Tangent Normals"
                className={`w-7 h-7 rounded-full bg-gradient-to-br from-[#ec4899] via-[#8b5cf6] to-[#06b6d4] border-2 transition-transform ${
                  shadingMode === 'matcap-normal' ? 'border-[#f5c518] scale-110 shadow-md' : 'border-transparent hover:scale-105'
                }`}
              />

              {/* Gold Matcap */}
              <button
                onClick={() => setShadingMode('matcap-gold')}
                title="Gold Lustre"
                className={`w-7 h-7 rounded-full bg-gradient-to-br from-[#f59e0b] to-[#d97706] border-2 transition-transform ${
                  shadingMode === 'matcap-gold' ? 'border-[#f5c518] scale-110 shadow-md' : 'border-transparent hover:scale-105'
                }`}
              />

              {/* Dark Obsidian */}
              <button
                onClick={() => setShadingMode('xray')}
                title="X-Ray Silhouette"
                className={`w-7 h-7 rounded-full bg-[#1f242d] border border-[#374151] border-2 transition-transform ${
                  shadingMode === 'xray' ? 'border-[#f5c518] scale-110 shadow-md' : 'border-transparent hover:scale-105'
                }`}
              />

              {/* Turquoise Stylized */}
              <button
                onClick={() => setShadingMode('matcap-turquoise')}
                title="Turquoise Gem"
                className={`w-7 h-7 rounded-full bg-[#06b6d4] border-2 transition-transform ${
                  shadingMode === 'matcap-turquoise' ? 'border-[#f5c518] scale-110 shadow-md' : 'border-transparent hover:scale-105'
                }`}
              />
            </div>
          </div>

           {/* Bottom Transport Control Bar (Matching Reference Image) */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2">
            {/* Free Orbit / Camera Presets Dropdown */}
            <div className="relative">
              <button
                onClick={() => setCameraMenuOpen(!cameraMenuOpen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--ws-hud-bg,#12141a)]/95 backdrop-blur-md border border-[var(--ws-hud-border,#232733)] text-xs font-semibold text-[var(--ws-text,#f3f4f6)] hover:border-[#f5c518]/50 shadow-xl transition-all"
              >
                <RotateCw className="w-3.5 h-3.5 text-[#f5c518]" />
                <span className="capitalize">{cameraPreset} View</span>
                <ChevronDown className="w-3 h-3 text-[var(--ws-text-muted,#8e95a5)]" />
              </button>

              {cameraMenuOpen && (
                <div className="absolute bottom-full left-0 mb-1.5 w-40 py-1 rounded-xl bg-[var(--ws-dropdown-bg,#181a22)] border border-[var(--ws-border,#2b3040)] shadow-2xl z-50 text-xs">
                  {(['perspective', 'front', 'back', 'top', 'bottom', 'left', 'right'] as CameraViewPreset[]).map((p) => (
                    <button
                      key={p}
                      onClick={() => applyCameraPreset(p)}
                      className={`w-full text-left px-3 py-1.5 capitalize hover:bg-[var(--ws-hover-bg,#232734)] transition-colors flex items-center justify-between ${
                        cameraPreset === p ? 'text-[#f5c518] font-bold' : 'text-[var(--ws-text-muted,#cbd5e1)]'
                      }`}
                    >
                      <span>{p}</span>
                      {cameraPreset === p && <Check className="w-3 h-3 text-[#f5c518]" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Snap to Grid */}
            <button
              onClick={() => {
                if (cameraRef.current && controlsRef.current) {
                  cameraRef.current.position.set(0, 0.4, 4.0);
                  controlsRef.current.target.set(0, 0.4, 0);
                  controlsRef.current.update();
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--ws-hud-bg,#12141a)]/95 backdrop-blur-md border border-[var(--ws-hud-border,#232733)] text-xs font-semibold text-[var(--ws-text-muted,#8e95a5)] hover:text-[var(--ws-text,#f3f4f6)] hover:border-[var(--ws-border,#3a4152)] shadow-xl transition-all"
            >
              <span>Snap</span>
            </button>

            {/* 3D Print Preparation */}
            <button
              onClick={() => setIsExportModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--ws-hud-bg,#12141a)]/95 backdrop-blur-md border border-[var(--ws-hud-border,#232733)] text-xs font-semibold text-[var(--ws-text-muted,#8e95a5)] hover:text-[var(--ws-text,#f3f4f6)] hover:border-[var(--ws-border,#3a4152)] shadow-xl transition-all"
            >
              <Printer className="w-3.5 h-3.5 text-[#a855f7]" />
              <span>3D Print</span>
            </button>

            {/* Direct Export 3D Bundle Button (Purple/Indigo theme matching reference image) */}
            <button
              onClick={() => setIsExportModalOpen(true)}
              className="flex items-center gap-2 px-4 py-1.5 rounded-xl bg-[#6366f1] hover:bg-[#4f46e5] text-white text-xs font-bold shadow-xl shadow-[#6366f1]/25 active:scale-95 transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
};

/**
 * Procedural Geometry Builder for various models (Goblin, Mech Robot, Classical Statue, etc.)
 */
function buildAssetGeometry(type: string, parentGroup: THREE.Group, shading: ShadingMode) {
  // Material creation helper
  const getMaterial = (baseColor: number, roughness = 0.5, metalness = 0.2) => {
    switch (shading) {
      case 'clay':
        return new THREE.MeshStandardMaterial({ color: 0x9e9aa1, roughness: 0.9, metalness: 0.0 });
      case 'matcap-gold':
        return new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.25, metalness: 0.9 });
      case 'matcap-chrome':
        return new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.05, metalness: 0.95 });
      case 'matcap-ceramic':
        return new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.15, metalness: 0.1 });
      case 'matcap-turquoise':
        return new THREE.MeshStandardMaterial({ color: 0x06b6d4, roughness: 0.2, metalness: 0.4 });
      case 'matcap-normal':
        return new THREE.MeshNormalMaterial();
      case 'wireframe':
        return new THREE.MeshBasicMaterial({ color: 0x22c55e, wireframe: true });
      case 'xray':
        return new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8, metalness: 0.2, transparent: true, opacity: 0.85 });
      case 'textured':
      default:
        return new THREE.MeshStandardMaterial({ color: baseColor, roughness, metalness });
    }
  };

  const pedestalGeo = new THREE.CylinderGeometry(0.9, 1.0, 0.2, 32);
  const pedestalMat = getMaterial(0x8a7e6b, 0.8, 0.1);
  const pedestal = new THREE.Mesh(pedestalGeo, pedestalMat);
  pedestal.position.y = -0.55;
  pedestal.receiveShadow = true;
  pedestal.castShadow = true;
  parentGroup.add(pedestal);

  if (type === 'robot') {
    // Mech Robot Builder
    const bodyGeo = new THREE.SphereGeometry(0.65, 32, 24);
    const bodyMat = getMaterial(0x4a7c9d, 0.35, 0.8);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.5;
    body.castShadow = true;
    parentGroup.add(body);

    const eyeGeo = new THREE.SphereGeometry(0.18, 16, 16);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
    const eyeLeft = new THREE.Mesh(eyeGeo, eyeMat);
    eyeLeft.position.set(-0.25, 0.6, 0.52);
    const eyeRight = new THREE.Mesh(eyeGeo, eyeMat);
    eyeRight.position.set(0.25, 0.6, 0.52);
    parentGroup.add(eyeLeft, eyeRight);

    const antennaGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.4, 8);
    const antenna = new THREE.Mesh(antennaGeo, getMaterial(0xf59e0b, 0.2, 0.9));
    antenna.position.set(0, 1.25, 0);
    parentGroup.add(antenna);
  } else if (type === 'statue') {
    // Classical Statue Builder
    const torsoGeo = new THREE.CylinderGeometry(0.35, 0.28, 1.1, 24);
    const torsoMat = getMaterial(0xd8d4cb, 0.7, 0.05);
    const torso = new THREE.Mesh(torsoGeo, torsoMat);
    torso.position.y = 0.45;
    torso.castShadow = true;
    parentGroup.add(torso);

    const headGeo = new THREE.SphereGeometry(0.32, 24, 20);
    const head = new THREE.Mesh(headGeo, torsoMat);
    head.position.y = 1.15;
    head.castShadow = true;
    parentGroup.add(head);
  } else {
    // Default Goblin Warrior (Low-poly Stylized - Matching reference image!)
    const headGeo = new THREE.DodecahedronGeometry(0.65, 1);
    const headMat = getMaterial(0x739648, 0.6, 0.1);
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(0, 0.65, 0);
    head.castShadow = true;
    parentGroup.add(head);

    // Large Elf Ears
    const earGeo = new THREE.ConeGeometry(0.28, 0.7, 5);
    const earLeft = new THREE.Mesh(earGeo, headMat);
    earLeft.position.set(-0.75, 0.75, -0.05);
    earLeft.rotation.z = Math.PI / 2.6;
    earLeft.rotation.x = -0.2;
    const earRight = new THREE.Mesh(earGeo, headMat);
    earRight.position.set(0.75, 0.75, -0.05);
    earRight.rotation.z = -Math.PI / 2.6;
    earRight.rotation.x = -0.2;
    parentGroup.add(earLeft, earRight);

    // Expressive Eyes
    const eyeGeo = new THREE.SphereGeometry(0.16, 16, 16);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xe66e19, roughness: 0.1 });
    const eyeLeft = new THREE.Mesh(eyeGeo, eyeMat);
    eyeLeft.position.set(-0.24, 0.72, 0.52);
    const eyeRight = new THREE.Mesh(eyeGeo, eyeMat);
    eyeRight.position.set(0.24, 0.72, 0.52);
    parentGroup.add(eyeLeft, eyeRight);

    // Leather Armor & Belt
    const bodyGeo = new THREE.CylinderGeometry(0.38, 0.45, 0.65, 8);
    const bodyMat = getMaterial(0x8a6343, 0.8, 0.1);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.05;
    body.castShadow = true;
    parentGroup.add(body);

    // Twin Daggers
    const daggerGeo = new THREE.BoxGeometry(0.06, 0.45, 0.04);
    const daggerMat = getMaterial(0xcccccc, 0.15, 0.95);
    const daggerL = new THREE.Mesh(daggerGeo, daggerMat);
    daggerL.position.set(-0.55, 0.0, 0.25);
    daggerL.rotation.z = -0.4;
    const daggerR = new THREE.Mesh(daggerGeo, daggerMat);
    daggerR.position.set(0.55, 0.0, 0.25);
    daggerR.rotation.z = 0.4;
    parentGroup.add(daggerL, daggerR);
  }
}
