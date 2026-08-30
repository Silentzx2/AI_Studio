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
  RotateCcw,
  RotateCw,
  Printer,
  Download,
  ChevronDown,
  Sparkles,
  Check,
  UploadCloud,
  Search,
  Sun
} from 'lucide-react';
import { useWorkspace } from '../store/WorkspaceContext';
import { CameraViewPreset, ModelAsset } from '../types';
import { SimpleTooltip } from '@/components/ui/simple-tooltip';

import { validate3DFile } from '../lib/fileValidation';

const disposeMaterial = (material: THREE.Material) => {
  Object.values(material).forEach((v) => { if (v instanceof THREE.Texture) v.dispose(); });
  material.dispose();
};

interface MeshViewerProps {
  className?: string;
  showOverlayUI?: boolean;
}

interface EnvironmentPreset {
  id: string;
  label: string;
  settings: {
    ambientIntensity: number;
    keyLightIntensity: number;
    fillLightIntensity: number;
    rimLightIntensity: number;
    exposure: number;
    backgroundColor: string;
    gridVisible: boolean;
  };
}

const ENVIRONMENT_PRESETS: EnvironmentPreset[] = [
  {
    id: 'studio',
    label: 'Studio',
    settings: {
      ambientIntensity: 2.0,
      keyLightIntensity: 4.0,
      fillLightIntensity: 2.5,
      rimLightIntensity: 2.5,
      exposure: 1.8,
      backgroundColor: 'hsl(0, 0%, 8%)',
      gridVisible: true,
    },
  },
  {
    id: 'game',
    label: 'Game',
    settings: {
      ambientIntensity: 1.0,
      keyLightIntensity: 4.5,
      fillLightIntensity: 2.0,
      rimLightIntensity: 3.5,
      exposure: 1.5,
      backgroundColor: 'hsl(0, 0%, 4%)',
      gridVisible: true,
    },
  },
  {
    id: 'real',
    label: 'Real',
    settings: {
      ambientIntensity: 2.5,
      keyLightIntensity: 3.5,
      fillLightIntensity: 3.0,
      rimLightIntensity: 2.0,
      exposure: 2.0,
      backgroundColor: 'hsl(0, 0%, 10%)',
      gridVisible: false,
    },
  },
  {
    id: 'dark',
    label: 'Dark',
    settings: {
      ambientIntensity: 0.8,
      keyLightIntensity: 5.0,
      fillLightIntensity: 1.0,
      rimLightIntensity: 3.0,
      exposure: 1.2,
      backgroundColor: 'hsl(0, 0%, 2%)',
      gridVisible: true,
    },
  },
];

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
    generate3DModel,
    viewportResetTrigger,
  } = useWorkspace();

  const [isLoading, setIsLoading] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [showEnvironmentPanel, setShowEnvironmentPanel] = useState(false);
  const [environmentSettings, setEnvironmentSettings] = useState({
    ambientIntensity: 1.2,
    keyLightIntensity: 3.0,
    fillLightIntensity: 1.8,
    rimLightIntensity: 2.5,
    exposure: 1.5,
    gridVisible: true,
    gridColor: 'hsl(0, 0%, 18%)',
    backgroundColor: 'hsl(0, 0%, 6%)',
    autoRotate: false,
    showAxes: true,
    showStats: true,
  });
  const [cameraPreset, setCameraPreset] = useState<CameraViewPreset>('perspective');
  const [cameraMenuOpen, setCameraMenuOpen] = useState(false);
  const [interactionMode, setInteractionMode] = useState<'orbit' | 'pan'>('orbit');
  const [isDragOver, setIsDragOver] = useState(false);
  const [dropToastMessage, setDropToastMessage] = useState<string | null>(null);
  const [dropToastIsHtmlError, setDropToastIsHtmlError] = useState(false);

  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

  const patchEnv = (updates: Partial<typeof environmentSettings>) =>
    setEnvironmentSettings((p) => ({ ...p, ...updates }));

  const applyPreset = useCallback((presetId: string) => {
    const preset = ENVIRONMENT_PRESETS.find(p => p.id === presetId);
    if (!preset) return;
    setSelectedPreset(presetId);
    setEnvironmentSettings((p) => ({ ...p, ...preset.settings }));
  }, []);

  // Internal Three.js references
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const currentMeshGroupRef = useRef<THREE.Group | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const keyLightRef = useRef<THREE.DirectionalLight | null>(null);
  const fillLightRef = useRef<THREE.DirectionalLight | null>(null);
  const rimLightRef = useRef<THREE.DirectionalLight | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const isTurntableRef = useRef(isTurntable);
  const blobUrlRef = useRef<string | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);
  const needsRenderRef = useRef(true);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  // Keep turntable ref in sync with prop
  useEffect(() => {
    isTurntableRef.current = isTurntable;
  }, [isTurntable]);

  // Update Three.js scene when environment settings change
  useEffect(() => {
    if (!sceneRef.current || !rendererRef.current) return;
    const scene = sceneRef.current;
    const renderer = rendererRef.current;

    // Update background color
    scene.background = new THREE.Color(environmentSettings.backgroundColor);

    // Update tone mapping exposure
    renderer.toneMappingExposure = environmentSettings.exposure;

    // Update grid visibility
    if (gridHelperRef.current) {
      gridHelperRef.current.visible = environmentSettings.gridVisible;
    }

    // Update light intensities
    scene.traverse((obj) => {
      if (obj instanceof THREE.AmbientLight) {
        obj.intensity = environmentSettings.ambientIntensity;
      }
    });
    if (keyLightRef.current) keyLightRef.current.intensity = environmentSettings.keyLightIntensity;
    if (fillLightRef.current) fillLightRef.current.intensity = environmentSettings.fillLightIntensity;
    if (rimLightRef.current) rimLightRef.current.intensity = environmentSettings.rimLightIntensity;
    needsRenderRef.current = true;
  }, [environmentSettings]);

  // Initialize Three.js Scene once
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x14161c);
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
    renderer.info.autoReset = false;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.5;
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

    // 5. Lighting Setup (Studio 3-Point Setup) - Brighter
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const mainKeyLight = new THREE.DirectionalLight(0xfff5ea, 3.0);
    mainKeyLight.position.set(4, 6, 5);
    mainKeyLight.castShadow = true;
    mainKeyLight.shadow.mapSize.width = 1024;
    mainKeyLight.shadow.mapSize.height = 1024;
    mainKeyLight.shadow.bias = -0.0001;
    scene.add(mainKeyLight);
    keyLightRef.current = mainKeyLight;

    const fillLight = new THREE.DirectionalLight(0x90b0ff, 1.8);
    fillLight.position.set(-5, 3, -3);
    scene.add(fillLight);
    fillLightRef.current = fillLight;

    const rimLight = new THREE.DirectionalLight(0xfff0d0, 2.5);
    rimLight.position.set(0, 5, -6);
    scene.add(rimLight);
    rimLightRef.current = rimLight;

    // 6. Floor Grid and Soft Shadow Floor - Brighter colors
    const grid = new THREE.GridHelper(10, 20, 0x4a5060, 0x2a3040);
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

    // 8. Animation & Render Loop (setAnimationLoop for better performance)
    const timer = new THREE.Timer();
    const animate = () => {
      if (!needsRenderRef.current && !isTurntableRef.current) return;
      timer.update();
      const delta = timer.getDelta();

      if (isTurntableRef.current && meshGroup && meshGroup.children.length > 0) {
        meshGroup.rotation.y += delta * 0.45;
      }

      controls.update();
      renderer.info.reset();
      renderer.render(scene, camera);
      needsRenderRef.current = false;
    };
    renderer.setAnimationLoop(animate);

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
      renderer.setAnimationLoop(null);
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          const material = obj.material;
          if (Array.isArray(material)) {
            material.forEach((m) => {
              Object.values(m).forEach((v) => { if (v instanceof THREE.Texture) v.dispose(); });
              m.dispose();
            });
          } else if (material) {
            Object.values(material).forEach((v) => { if (v instanceof THREE.Texture) v.dispose(); });
            material.dispose();
          }
        }
      });
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
    needsRenderRef.current = true;
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
          if (Array.isArray(material)) material.forEach(m => disposeMaterial(m));
          else if (material) disposeMaterial(material);
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
          // ponytail: verify response is binary before parsing as GLB.
          // Cloudflare tunnel or missing files can return HTML with 200 status.
          const response = await fetch(sourceUrl);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('text/html') || contentType.includes('application/json')) {
            const text = await response.clone().text();
            if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
              throw new Error('Model file served as HTML — possible token/auth failure. Open DevTools for details.');
            }
          }
          const blob = await response.blob();
          const blobUrl = URL.createObjectURL(blob);
          const loader = new GLTFLoader();
          const gltf = await loader.loadAsync(blobUrl);
          URL.revokeObjectURL(blobUrl);
          if (!cancelled) {
            group.add(gltf.scene);
            gltf.scene.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
              }
            });
            frameCamera(gltf.scene);
            needsRenderRef.current = true;
          }
        } else if (format === 'obj') {
          // ponytail: verify response is text before parsing as OBJ
          const objResponse = await fetch(sourceUrl);
          if (!objResponse.ok) throw new Error(`HTTP ${objResponse.status}`);
          const objContentType = objResponse.headers.get('content-type') || '';
          if (objContentType.includes('text/html') || objContentType.includes('application/json')) {
            const text = await objResponse.clone().text();
            if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
              throw new Error('Model file served as HTML — possible token/auth failure. Open DevTools for details.');
            }
          }
          const blob = await objResponse.blob();
          const blobUrl = URL.createObjectURL(blob);
          const loader = new OBJLoader();
          const object = await loader.loadAsync(blobUrl);
          URL.revokeObjectURL(blobUrl);
          if (!cancelled) {
            object.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                if (shadingMode === 'wireframe') {
                  const oldMaterial = child.material;
                  child.material = new THREE.MeshStandardMaterial({
                    color: 0xd0d5dc,
                    wireframe: true,
                    roughness: 0.75,
                    metalness: 0.05
                  });
                  if (Array.isArray(oldMaterial)) oldMaterial.forEach(m => disposeMaterial(m));
                  else if (oldMaterial) disposeMaterial(oldMaterial);
                }
              }
            });
            group.add(object);
            frameCamera(object);
            needsRenderRef.current = true;
          }
        } else if (format === 'ply') {
          const response = await fetch(sourceUrl);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('text/html') || contentType.includes('application/json')) {
            const text = await response.clone().text();
            if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
              throw new Error('Model file served as HTML — possible token/auth failure. Open DevTools for details.');
            }
          }
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
          frameCamera(mesh);
          needsRenderRef.current = true;
        } else {
          throw new Error(`No browser preview is available for ${currentAsset.format}.`);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Viewport asset load failed', error);
          const message = error instanceof Error ? error.message : 'Unable to preview asset';
          setDropToastMessage(message);
          setDropToastIsHtmlError(message.includes('served as HTML') || message.includes('token/auth'));
          if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
          toastTimeoutRef.current = window.setTimeout(() => {
            setDropToastMessage(null);
            setDropToastIsHtmlError(false);
          }, 6000);
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
  }, [currentAsset?.id, currentAsset?.source?.viewUrl, currentAsset?.source?.localUrl, currentAsset?.format, shadingMode, viewportResetTrigger]);

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
    needsRenderRef.current = true;
  }, []);

  const resetCamera = useCallback(() => {
    applyCameraPreset('perspective');
  }, [applyCameraPreset]);

  const frameCamera = useCallback((object: THREE.Object3D) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    controls.target.set(0, 0, 0);
    controls.update();

    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const radius = sphere.radius;

    if (radius === 0 || !isFinite(radius)) return;

    const fov = camera.fov * (Math.PI / 180);
    const distance = radius / Math.sin(fov / 2);

    const dir = new THREE.Vector3(1, 0.4, 1).normalize();
    camera.position.copy(center).add(dir.multiplyScalar(distance * 1.1));

    camera.near = Math.max(0.01, distance / 100);
    camera.far = distance * 100;
    camera.updateProjectionMatrix();

    controls.target.copy(center);
    controls.update();
  }, []);

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

  const handleDrop = async (e: React.DragEvent) => {
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
      const ext = file.name.split('.').pop()?.toUpperCase() || '';
      const ALLOWED_EXTENSIONS = ['GLB', 'GLTF', 'OBJ', 'PLY'];
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        setDropToastMessage(`Unsupported file format "${ext}". Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`);
        setTimeout(() => setDropToastMessage(null), 3500);
        return;
      }

      // Validate file structure before creating blob URL
      const validation = await validate3DFile(file, 'preview');
      if (!validation.valid) {
        setDropToastMessage(validation.error || 'Invalid file');
        setTimeout(() => setDropToastMessage(null), 3500);
        return;
      }

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
        source: { filename: file.name, subfolder: '', type: 'input', viewUrl: URL.createObjectURL(file) }
      };

      // Revoke old blob URL if exists
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
      blobUrlRef.current = customAsset.source?.viewUrl || null;

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
        <div className="absolute inset-0 bg-[hsl(var(--surface-0))] border-2 border-dashed border-[hsl(var(--primary))] flex flex-col items-center justify-center z-40 transition-all pointer-events-none">
          <div className="w-16 h-16 rounded-2xl bg-[hsl(var(--primary))]/15 border border-[hsl(var(--primary))]/40 flex items-center justify-center text-[hsl(var(--primary))] shadow-2xl animate-bounce mb-3">
            <UploadCloud className="w-8 h-8" />
          </div>
          <span className="text-base font-bold text-[hsl(var(--foreground))] tracking-wide">
            Drop 3D Asset to Load into Viewport
          </span>
          <span className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
            Loads geometry, textures, topology & material configs instantly
          </span>
        </div>
      )}

      {/* Drop Notification Toast */}
      {dropToastMessage && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-[hsl(var(--surface-2))] border border-[hsl(var(--primary))]/40 shadow-2xl flex items-center gap-2 text-xs font-semibold text-[hsl(var(--foreground))] animate-in fade-in slide-in-from-top-2 duration-300 max-w-md">
          {dropToastIsHtmlError ? (
            <Search className="w-4 h-4 text-[hsl(var(--destructive))] flex-shrink-0" />
          ) : (
            <Sparkles className="w-4 h-4 text-[hsl(var(--primary))]" />
          )}
          <span className="truncate">{dropToastMessage}</span>
          {dropToastIsHtmlError && (
            <button
              onClick={() => {
                setDropToastMessage(null);
                setDropToastIsHtmlError(false);
                window.dispatchEvent(new CustomEvent('openUploadDiagnostic'));
              }}
              className="ml-2 px-2 py-0.5 rounded-md bg-[hsl(var(--destructive))]/20 text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive))]/30 text-[10px] font-bold flex-shrink-0 transition-colors"
            >
              Diagnose
            </button>
          )}
        </div>
      )}

      {/* Loading Overlay */}
      {(isLoading || isExecuting) && (
        <div className="absolute inset-0 bg-[hsl(var(--surface-0))] flex flex-col items-center justify-center z-20 pointer-events-none transition-all">
          <div className="relative flex items-center justify-center">
            <div className="w-14 h-14 rounded-full border-2 border-[hsl(var(--border))] border-t-[hsl(var(--primary))] animate-spin" />
            <Sparkles className="w-5 h-5 text-[hsl(var(--primary))] absolute" />
          </div>
          <div className="mt-3 text-center">
            <span className="text-xs font-bold text-[hsl(var(--foreground))] tracking-wide block">
              {isExecuting ? 'FastAPI 3D Engine Processing...' : 'Compiling 3D Mesh Shaders...'}
            </span>
            {isExecuting && (
              <div className="mt-2 w-44 h-1.5 rounded-full bg-[hsl(var(--surface-2))] overflow-hidden">
                <div 
                  className="h-full bg-[hsl(var(--primary))] transition-all duration-300 rounded-full"
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
            <div className="bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] rounded-xl px-3.5 py-2 shadow-xl space-y-1 text-xs font-mono">
              <div className="flex items-center justify-between gap-4">
                <span className="text-[hsl(var(--muted-foreground))] text-[11px]">Topology</span>
                <span className="text-[hsl(var(--foreground))] font-semibold text-[11px] flex items-center gap-1">
                  {currentAsset?.statsAvailable ? currentAsset.topology : '—'} <ChevronDown className="w-3 h-3 text-[hsl(var(--muted-foreground))]" />
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-[hsl(var(--muted-foreground))] text-[11px]">Faces</span>
                <span className="text-[hsl(var(--neon-green))] font-semibold text-[11px]">
                  {currentAsset?.statsAvailable ? `${currentAsset.faces.toLocaleString()} / ${currentAsset.vertices.toLocaleString()}` : '—'}
                </span>
              </div>
            </div>

            {/* 3D Axis Orientation Widget / Gizmo */}
            <SimpleTooltip label="Reset Orbit Camera">
              <div
                onClick={resetCamera}
                className="w-11 h-11 rounded-xl bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] flex items-center justify-center cursor-pointer hover:border-[hsl(var(--primary))] shadow-xl group transition-all"
              >
                <div className="relative w-6 h-6 flex items-center justify-center">
                  <span className="text-[9px] font-bold text-[hsl(var(--destructive))] absolute -top-1">Y</span>
                  <span className="text-[9px] font-bold text-[hsl(var(--neon-green))] absolute -right-1">X</span>
                  <span className="text-[9px] font-bold text-[hsl(var(--neon-blue))] absolute -bottom-1">Z</span>
                  <div className="w-2 h-2 rounded-full bg-[hsl(var(--primary))] group-hover:scale-125 transition-transform" />
                </div>
              </div>
            </SimpleTooltip>
          </div>

          {/* Right Floating Tool Rail (Hand, Camera, Grid, Help, Turntable) */}
          <div className="absolute right-4 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-1.3 bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] p-1.5 rounded-2xl shadow-2xl">
            <SimpleTooltip label={interactionMode === 'orbit' ? 'Switch to Pan Mode' : 'Switch to Orbit Mode'}>
              <button
                onClick={() => setInteractionMode(interactionMode === 'orbit' ? 'pan' : 'orbit')}
                className={`p-2 rounded-xl transition-all ${
                  interactionMode === 'pan' 
                    ? 'bg-[hsl(var(--primary))] text-[hsl(var(--surface-1))]' 
                    : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-1))]'
                }`}
              >
                <Hand className="w-4 h-4" />
              </button>
            </SimpleTooltip>

            <SimpleTooltip label="Capture 3D Viewport Screenshot">
              <button
                onClick={handleScreenshot}
                className="p-2 rounded-xl text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-1))] transition-all"
              >
                <Camera className="w-4 h-4" />
              </button>
            </SimpleTooltip>

            <SimpleTooltip label={showGrid ? 'Hide Floor Grid' : 'Show Floor Grid'}>
              <button
                onClick={() => setShowGrid(!showGrid)}
                className={`p-2 rounded-xl transition-all ${
                  showGrid 
                    ? 'text-[hsl(var(--primary))] bg-[hsl(var(--surface-2))]' 
                    : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-1))]'
                }`}
              >
                <GridIcon className="w-4 h-4" />
              </button>
            </SimpleTooltip>

            <SimpleTooltip label={isTurntable ? 'Pause Turntable 360°' : 'Start Turntable 360°'}>
              <button
                onClick={() => setIsTurntable(!isTurntable)}
                className={`p-2 rounded-xl transition-all ${
                  isTurntable 
                    ? 'bg-[hsl(var(--primary))] text-[hsl(var(--surface-1))]' 
                    : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-1))]'
                }`}
              >
                <RotateCw className="w-4 h-4" />
              </button>
            </SimpleTooltip>

            <SimpleTooltip label="Reset Camera (Hotkey: F)">
              <button
                onClick={resetCamera}
                className="p-2 rounded-xl text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-1))] transition-all"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </SimpleTooltip>

            <SimpleTooltip label="Environment Settings — Lighting, Grid, Camera">
              <button
                onClick={() => setShowEnvironmentPanel(!showEnvironmentPanel)}
                className={`p-2 rounded-xl transition-all ${
                  showEnvironmentPanel
                    ? 'bg-[hsl(var(--primary))] text-[hsl(var(--surface-1))]'
                    : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-1))]'
                }`}
              >
                <Sun className="w-4 h-4" />
              </button>
            </SimpleTooltip>
          </div>

          {/* Environment Settings Panel */}
          {showEnvironmentPanel && (
            <div className="absolute right-16 top-1/2 -translate-y-1/2 z-20 w-72 bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] rounded-2xl shadow-2xl p-4 space-y-3">
              <h3 className="text-[10px] font-bold tracking-wider text-[hsl(var(--primary))] uppercase">Environment Settings</h3>

              {/* Presets Section */}
              <div className="space-y-1.5">
                <span className="text-[9px] font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Presets</span>
                <div className="flex flex-wrap gap-1.5">
                  {ENVIRONMENT_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => applyPreset(preset.id)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all ${
                        selectedPreset === preset.id
                          ? 'bg-[hsl(var(--primary))] text-[hsl(var(--surface-1))] shadow-md shadow-[hsl(var(--primary))]/20'
                          : 'bg-[hsl(var(--surface-1))] text-[hsl(var(--muted-foreground))] border border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]/50 hover:text-[hsl(var(--primary))]'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Lighting Section */}
              <div className="space-y-2">
                <span className="text-[9px] font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Lighting</span>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-[hsl(var(--muted-foreground))]">Ambient</span>
                    <span className="text-[9px] font-mono text-[hsl(var(--primary))]">{environmentSettings.ambientIntensity.toFixed(1)}</span>
                  </div>
                  <input type="range" min={0} max={3} step={0.1} value={environmentSettings.ambientIntensity} onChange={(e) => patchEnv({ ambientIntensity: parseFloat(e.target.value) })} className="w-full h-1 rounded-full bg-[hsl(var(--border))] appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[hsl(var(--primary))]" />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-[hsl(var(--muted-foreground))]">Key Light</span>
                    <span className="text-[9px] font-mono text-[hsl(var(--primary))]">{environmentSettings.keyLightIntensity.toFixed(1)}</span>
                  </div>
                  <input type="range" min={0} max={5} step={0.1} value={environmentSettings.keyLightIntensity} onChange={(e) => patchEnv({ keyLightIntensity: parseFloat(e.target.value) })} className="w-full h-1 rounded-full bg-[hsl(var(--border))] appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[hsl(var(--primary))]" />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-[hsl(var(--muted-foreground))]">Fill Light</span>
                    <span className="text-[9px] font-mono text-[hsl(var(--primary))]">{environmentSettings.fillLightIntensity.toFixed(1)}</span>
                  </div>
                  <input type="range" min={0} max={4} step={0.1} value={environmentSettings.fillLightIntensity} onChange={(e) => patchEnv({ fillLightIntensity: parseFloat(e.target.value) })} className="w-full h-1 rounded-full bg-[hsl(var(--border))] appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[hsl(var(--primary))]" />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-[hsl(var(--muted-foreground))]">Rim Light</span>
                    <span className="text-[9px] font-mono text-[hsl(var(--primary))]">{environmentSettings.rimLightIntensity.toFixed(1)}</span>
                  </div>
                  <input type="range" min={0} max={4} step={0.1} value={environmentSettings.rimLightIntensity} onChange={(e) => patchEnv({ rimLightIntensity: parseFloat(e.target.value) })} className="w-full h-1 rounded-full bg-[hsl(var(--border))] appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[hsl(var(--primary))]" />
                </div>
              </div>

              {/* Exposure Section */}
              <div className="space-y-1.5">
                <span className="text-[9px] font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Camera</span>
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-[hsl(var(--muted-foreground))]">Exposure</span>
                  <span className="text-[9px] font-mono text-[hsl(var(--primary))]">{environmentSettings.exposure.toFixed(2)}</span>
                </div>
                <input type="range" min={0.5} max={3} step={0.05} value={environmentSettings.exposure} onChange={(e) => patchEnv({ exposure: parseFloat(e.target.value) })} className="w-full h-1 rounded-full bg-[hsl(var(--border))] appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[hsl(var(--primary))]" />
              </div>

              {/* Grid Toggle */}
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-[hsl(var(--muted-foreground))]">Show Grid</span>
                <button onClick={() => patchEnv({ gridVisible: !environmentSettings.gridVisible })} className={`w-7 h-3.5 rounded-full transition-colors relative ${environmentSettings.gridVisible ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--border))]'}`}>
                  <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-[hsl(var(--primary-foreground))] transition-transform ${environmentSettings.gridVisible ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                </button>
              </div>

              {/* Reset to Defaults */}
              <button onClick={() => setEnvironmentSettings({ ambientIntensity: 1.2, keyLightIntensity: 3.0, fillLightIntensity: 1.8, rimLightIntensity: 2.5, exposure: 1.5, gridVisible: true, gridColor: 'hsl(0, 0%, 18%)', backgroundColor: 'hsl(0, 0%, 6%)', autoRotate: false, showAxes: true, showStats: true })} className="w-full py-1.5 rounded-lg text-[9px] font-semibold text-[hsl(var(--muted-foreground))] bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]/50 hover:text-[hsl(var(--primary))] transition-colors">
                Reset to Defaults
              </button>
            </div>
          )}

          {/* Shading Material Swatches Bar (Bottom Center - Exact Match to Screenshot) */}
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-10">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] shadow-2xl">
              {/* Textured / PBR */}
              <SimpleTooltip label="PBR Textured">
                <button
                  onClick={() => setShadingMode('textured')}
                  className={`w-7 h-7 rounded-full overflow-hidden border-2 transition-transform ${
                    shadingMode === 'textured' ? 'border-[hsl(var(--primary))] scale-110 shadow-md' : 'border-transparent hover:scale-105'
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
                    <div className="w-full h-full bg-[hsl(var(--surface-2))]" />
                  )}
                </button>
              </SimpleTooltip>

              {/* Clay */}
              <SimpleTooltip label="Matte Clay">
                <button
                  onClick={() => setShadingMode('clay')}
                  className={`w-7 h-7 rounded-full bg-[hsl(var(--muted-foreground))] border-2 transition-transform ${
                    shadingMode === 'clay' ? 'border-[hsl(var(--primary))] scale-110 shadow-md' : 'border-transparent hover:scale-105'
                  }`}
                />
              </SimpleTooltip>

              {/* White Ceramic */}
              <SimpleTooltip label="Ceramic Gloss">
                <button
                  onClick={() => setShadingMode('matcap-ceramic')}
                  className={`w-7 h-7 rounded-full bg-[hsl(var(--foreground))] border-2 transition-transform ${
                    shadingMode === 'matcap-ceramic' ? 'border-[hsl(var(--primary))] scale-110 shadow-md' : 'border-transparent hover:scale-105'
                  }`}
                />
              </SimpleTooltip>

              {/* Chrome Metallic */}
              <SimpleTooltip label="Chrome Metallic">
                <button
                  onClick={() => setShadingMode('matcap-chrome')}
                  className={`w-7 h-7 rounded-full bg-gradient-to-tr from-[hsl(var(--surface-2))] via-[hsl(var(--muted-foreground))] to-[hsl(var(--foreground))] border-2 transition-transform ${
                    shadingMode === 'matcap-chrome' ? 'border-[hsl(var(--primary))] scale-110 shadow-md' : 'border-transparent hover:scale-105'
                  }`}
                />
              </SimpleTooltip>

              {/* Wireframe */}
              <SimpleTooltip label="Topology Wireframe">
                <button
                  onClick={() => setShadingMode('wireframe')}
                  className={`w-7 h-7 rounded-full bg-[hsl(var(--surface-1))] border-2 flex items-center justify-center text-[10px] text-[hsl(var(--neon-green))] transition-transform ${
                    shadingMode === 'wireframe' ? 'border-[hsl(var(--primary))] scale-110 shadow-md' : 'border-transparent hover:scale-105'
                  }`}
                >
                  #
                </button>
              </SimpleTooltip>

              {/* Normal Map */}
              <SimpleTooltip label="Tangent Normals">
                <button
                  onClick={() => setShadingMode('matcap-normal')}
                  className={`w-7 h-7 rounded-full bg-gradient-to-br from-[hsl(var(--neon-pink))] via-[hsl(var(--neon-purple))] to-[hsl(var(--neon-cyan))] border-2 transition-transform ${
                    shadingMode === 'matcap-normal' ? 'border-[hsl(var(--primary))] scale-110 shadow-md' : 'border-transparent hover:scale-105'
                  }`}
                />
              </SimpleTooltip>

              {/* Gold Matcap */}
              <SimpleTooltip label="Gold Lustre">
                <button
                  onClick={() => setShadingMode('matcap-gold')}
                  className={`w-7 h-7 rounded-full bg-gradient-to-br from-[hsl(var(--neon-amber))] to-[hsl(var(--neon-amber))] border-2 transition-transform ${
                    shadingMode === 'matcap-gold' ? 'border-[hsl(var(--primary))] scale-110 shadow-md' : 'border-transparent hover:scale-105'
                  }`}
                />
              </SimpleTooltip>

              {/* Dark Obsidian */}
              <SimpleTooltip label="X-Ray Silhouette">
                <button
                  onClick={() => setShadingMode('xray')}
                  className={`w-7 h-7 rounded-full bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] border-2 transition-transform ${
                    shadingMode === 'xray' ? 'border-[hsl(var(--primary))] scale-110 shadow-md' : 'border-transparent hover:scale-105'
                  }`}
                />
              </SimpleTooltip>

              {/* Turquoise Stylized */}
              <SimpleTooltip label="Turquoise Gem">
                <button
                  onClick={() => setShadingMode('matcap-turquoise')}
                  className={`w-7 h-7 rounded-full bg-[hsl(var(--neon-cyan))] border-2 transition-transform ${
                    shadingMode === 'matcap-turquoise' ? 'border-[hsl(var(--primary))] scale-110 shadow-md' : 'border-transparent hover:scale-105'
                  }`}
                />
              </SimpleTooltip>
            </div>
          </div>

           {/* Bottom Transport Control Bar (Matching Reference Image) */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2">
            {/* Free Orbit / Camera Presets Dropdown */}
            <div className="relative">
              <button
                onClick={() => setCameraMenuOpen(!cameraMenuOpen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] text-xs font-semibold text-[hsl(var(--foreground))] hover:border-[hsl(var(--primary))]/50 shadow-xl transition-all"
              >
                <RotateCw className="w-3.5 h-3.5 text-[hsl(var(--primary))]" />
                <span className="capitalize">{cameraPreset} View</span>
                <ChevronDown className="w-3 h-3 text-[hsl(var(--muted-foreground))]" />
              </button>

              {cameraMenuOpen && (
                <div className="absolute bottom-full left-0 mb-1.5 w-40 py-1 rounded-xl bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] shadow-2xl z-50 text-xs">
                  {(['perspective', 'front', 'back', 'top', 'bottom', 'left', 'right'] as CameraViewPreset[]).map((p) => (
                    <button
                      key={p}
                      onClick={() => applyCameraPreset(p)}
                      className={`w-full text-left px-3 py-1.5 capitalize hover:bg-[hsl(var(--surface-1))] transition-colors flex items-center justify-between ${
                        cameraPreset === p ? 'text-[hsl(var(--primary))] font-bold' : 'text-[hsl(var(--muted-foreground))]'
                      }`}
                    >
                      <span>{p}</span>
                      {cameraPreset === p && <Check className="w-3 h-3 text-[hsl(var(--primary))]" />}
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
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] text-xs font-semibold text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:border-[hsl(var(--border))] shadow-xl transition-all"
            >
              <span>Snap</span>
            </button>

            {/* 3D Print Preparation */}
            <button
              onClick={() => setIsExportModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] text-xs font-semibold text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:border-[hsl(var(--border))] shadow-xl transition-all"
            >
              <Printer className="w-3.5 h-3.5 text-[hsl(var(--neon-purple))]" />
              <span>3D Print</span>
            </button>

            {/* Direct Export 3D Bundle Button (Purple/Indigo theme matching reference image) */}
            <button
              onClick={() => setIsExportModalOpen(true)}
              className="flex items-center gap-2 px-4 py-1.5 rounded-xl bg-[hsl(var(--neon-purple))] hover:bg-[hsl(var(--neon-purple))] text-white text-xs font-bold shadow-xl shadow-[hsl(var(--neon-purple))]/25 active:scale-95 transition-all"
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


