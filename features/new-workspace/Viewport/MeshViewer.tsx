import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
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
  Sun,
  Move,
  Box,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Compass
} from 'lucide-react';
import { useWorkspace } from '../store/WorkspaceContext';
import { CameraViewPreset, ModelAsset } from '../types';
import { SimpleTooltip } from '@/components/ui/simple-tooltip';
import { apiClient } from '@/services/apiClient';

import { validate3DFile } from '../lib/fileValidation';
import { createPointCloudFromImage, createFallbackPointCloud, disposePointCloud } from './ImagePointCloud';

const disposeMaterial = (material: THREE.Material) => {
  Object.values(material).forEach((v) => { if (v instanceof THREE.Texture) v.dispose(); });
  material.dispose();
};

// Reusable loaders to avoid GC churn on frequent model switching
const sharedGLTFLoader = new GLTFLoader();
const sharedOBJLoader = new OBJLoader();
const sharedPLYLoader = new PLYLoader();

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
    id: 'real',
    label: 'Real',
    settings: {
      ambientIntensity: 2.5,
      keyLightIntensity: 3.5,
      fillLightIntensity: 3.0,
      rimLightIntensity: 2.0,
      exposure: 2.0,
      backgroundColor: '#22242a',
      gridVisible: false,
    },
  },
  {
    id: 'studio',
    label: 'Studio',
    settings: {
      ambientIntensity: 2.0,
      keyLightIntensity: 4.0,
      fillLightIntensity: 2.5,
      rimLightIntensity: 2.5,
      exposure: 1.8,
      backgroundColor: '#1e2026',
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
      backgroundColor: '#14161b',
      gridVisible: true,
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
      backgroundColor: '#0d0e11',
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
    updateAssetProperties,
    shadingMode, 
    setShadingMode,
    isTurntable,
    setIsTurntable,
    isExecuting,
    executionProgress,
    executionStep,
    cancelExecution,
    generationSettings,
    textureSettings,
    activeTool,
    setActiveTool,
    setIsExportModalOpen,
    generate3DModel,
    viewportResetTrigger,
    isLeftPanelOpen,
    setIsLeftPanelOpen,
    leftPanelWidth,
    isRightPanelOpen,
    rightPanelWidth
  } = useWorkspace();

  const rightOffset = isRightPanelOpen ? (rightPanelWidth + 12) : 12;
  const leftOffset = isLeftPanelOpen ? (leftPanelWidth + 12) : 12;

  const [isLoading, setIsLoading] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [showEnvironmentPanel, setShowEnvironmentPanel] = useState(false);
  const [environmentSettings, setEnvironmentSettings] = useState({
    ambientIntensity: 2.5,
    keyLightIntensity: 3.5,
    fillLightIntensity: 3.0,
    rimLightIntensity: 2.0,
    exposure: 2.0,
    gridVisible: false,
    gridColor: '#3d4252',
    backgroundColor: '#22242a',
    autoRotate: false,
    showAxes: false,
    showStats: true,
  });
  const [cameraPreset, setCameraPreset] = useState<CameraViewPreset>('perspective');
  const [cameraMenuOpen, setCameraMenuOpen] = useState(false);
  const [interactionMode, setInteractionMode] = useState<'orbit' | 'pan' | 'move'>('orbit');
  const [isDragOver, setIsDragOver] = useState(false);
  const [dropToastMessage, setDropToastMessage] = useState<string | null>(null);
  const [dropToastIsHtmlError, setDropToastIsHtmlError] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string | null>('real');
  const [meshStats, setMeshStats] = useState<{ faces: number; vertices: number; triangles: number } | null>(null);
  const [debugBlueprint, setDebugBlueprint] = useState(false);

  useEffect(() => {
    const handleToggle = (e: Event) => {
      const customEvent = e as CustomEvent<{ force?: boolean }>;
      setDebugBlueprint((prev) => (customEvent.detail?.force !== undefined ? customEvent.detail.force : !prev));
    };
    window.addEventListener('toggleBlueprintPreview', handleToggle);
    return () => window.removeEventListener('toggleBlueprintPreview', handleToggle);
  }, []);

  const patchEnv = (updates: Partial<typeof environmentSettings>) =>
    setEnvironmentSettings((p) => ({ ...p, ...updates }));

  const applyPreset = useCallback((presetId: string) => {
    const preset = ENVIRONMENT_PRESETS.find(p => p.id === presetId);
    if (!preset) return;
    setSelectedPreset(presetId);
    setEnvironmentSettings((p) => ({ ...p, ...preset.settings }));
  }, []);

  const computeMeshStats = useCallback((object: THREE.Object3D) => {
    let f = 0, v = 0;
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const geom = child.geometry;
        if (geom) {
          if (geom.index) {
            f += geom.index.count / 3;
          } else if (geom.attributes?.position) {
            f += geom.attributes.position.count / 3;
          }
          if (geom.attributes?.position) {
            v += geom.attributes.position.count;
          }
        }
      }
    });
    const faces = Math.round(f);
    const verts = Math.round(v);
    const triangles = Math.round(f);
    setMeshStats({ faces, vertices: verts, triangles });

    if (currentAsset) {
      // Use immutable update to trigger React re-render
      updateAssetProperties(currentAsset.id, {
        faces,
        vertices: verts,
        triangles,
        statsAvailable: true,
      });
    }
  }, [currentAsset, updateAssetProperties]);

  // Internal Three.js references
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const transformControlsRef = useRef<TransformControls | null>(null);
  const currentMeshGroupRef = useRef<THREE.Group | null>(null);
  const pointCloudRef = useRef<THREE.Points | null>(null);
  const pointCloudGroupRef = useRef<THREE.Group | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const keyLightRef = useRef<THREE.DirectionalLight | null>(null);
  const fillLightRef = useRef<THREE.DirectionalLight | null>(null);
  const rimLightRef = useRef<THREE.DirectionalLight | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const isTurntableRef = useRef(isTurntable);
  const blobUrlRef = useRef<string | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  // Sync interactionMode with OrbitControls / TransformControls
  useEffect(() => {
    if (!controlsRef.current) return;
    if (interactionMode === 'pan') {
      controlsRef.current.mouseButtons.LEFT = THREE.MOUSE.PAN;
    } else {
      controlsRef.current.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
    }

    if (transformControlsRef.current) {
      const tc = transformControlsRef.current;
      if (interactionMode === 'move' && currentMeshGroupRef.current && currentMeshGroupRef.current.children.length > 0) {
        tc.attach(currentMeshGroupRef.current);
        tc.enabled = true;
      } else {
        tc.detach();
        tc.enabled = false;
      }
    }
  }, [interactionMode]);

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
  }, [environmentSettings]);

  // Initialize Three.js Scene once
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    // 1. Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 1.2, 3.8);
    cameraRef.current = camera;

    // 3. Renderer with preserveDrawingBuffer enabled for real camera snapshots
    const renderer = new THREE.WebGLRenderer({ 
      antialias: true, 
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(width, height);
    // ponytail: cap pixel ratio at 1.5 for smooth rendering FPS
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
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
    controls.maxDistance = 100;    // Increased from 25 — allow much further zoom out
    controls.minDistance = 0.05;   // Decreased from 0.8 — allow much closer zoom in
    controls.zoomSpeed = 1.5;     // Increased scroll-wheel zoom speed
    controls.target.set(0, 0.4, 0);
    controlsRef.current = controls;

    // 4b. TransformControls for translating 3D model
    const transformControls = new TransformControls(camera, renderer.domElement);
    transformControls.size = 0.8;
    transformControls.setMode('translate');
    transformControls.enabled = false;
    transformControls.addEventListener('dragging-changed', (event: any) => {
      controls.enabled = !event.value;
    });
    scene.add(transformControls.getHelper() as unknown as THREE.Object3D);
    transformControlsRef.current = transformControls;

    // 5. Lighting Setup (Studio 3-Point Setup) - Brighter
    const ambientLight = new THREE.AmbientLight(0xffffff, 2.5);
    scene.add(ambientLight);

    const mainKeyLight = new THREE.DirectionalLight(0xfff5ea, 3.5);
    mainKeyLight.position.set(4, 6, 5);
    mainKeyLight.castShadow = true;
    // ponytail: 512 shadow map is enough for studio preview. 1024 = 4x GPU cost.
    // Upgrade path: adaptive quality based on mesh complexity
    mainKeyLight.shadow.mapSize.width = 512;
    mainKeyLight.shadow.mapSize.height = 512;
    mainKeyLight.shadow.bias = -0.0001;
    scene.add(mainKeyLight);
    keyLightRef.current = mainKeyLight;

    const fillLight = new THREE.DirectionalLight(0x90b0ff, 3.0);
    fillLight.position.set(-5, 3, -3);
    scene.add(fillLight);
    fillLightRef.current = fillLight;

    const rimLight = new THREE.DirectionalLight(0xfff0d0, 2.0);
    rimLight.position.set(0, 5, -6);
    scene.add(rimLight);
    rimLightRef.current = rimLight;

    // 6. Floor Grid and Soft Shadow Floor - Disabled by default
    const grid = new THREE.GridHelper(10, 20, 0x4a5060, 0x2a3040);
    grid.position.y = -0.65;
    grid.visible = false;
    scene.add(grid);
    gridHelperRef.current = grid;

    scene.background = new THREE.Color(0x22242a);

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

    // Interactive Generation Point Cloud Group (Tripo AI silhouette preview)
    const pointCloudGroup = new THREE.Group();
    pointCloudGroup.visible = false;
    scene.add(pointCloudGroup);
    pointCloudGroupRef.current = pointCloudGroup;

    // 8. Animation & Render Loop — demand-based rendering with idle settling to save browser GPU
    const timer = new THREE.Timer();
    let idleFrames = 0;

    controls.addEventListener('change', () => {
      idleFrames = 0;
    });

    const animate = () => {
      timer.update();
      const delta = timer.getDelta();

      const turntableActive = Boolean(isTurntableRef.current && meshGroup && meshGroup.children.length > 0);
      if (turntableActive) {
        meshGroup.rotation.y += delta * 0.45;
      }

      const pointCloudActive = Boolean(pointCloudGroup && pointCloudGroup.visible && pointCloudGroup.children.length > 0);
      if (pointCloudActive) {
        pointCloudGroup.rotation.y += delta * 0.25;
      }

      const controlsChanged = controls.update();
      if (turntableActive || pointCloudActive || controlsChanged || idleFrames < 60) {
        if (turntableActive || pointCloudActive || controlsChanged) {
          idleFrames = 0;
        } else {
          idleFrames++;
        }
        renderer.info.reset();
        renderer.render(scene, camera);
      }
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
        idleFrames = 0;
        renderer.render(scene, camera);
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      renderer.setAnimationLoop(null);
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      transformControls.dispose();
      controls.dispose();
      renderer.dispose();
      if (pointCloudRef.current) {
        disposePointCloud(pointCloudRef.current);
        pointCloudRef.current = null;
      }
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
  }, [showGrid]);

  // Interactive 3D Point Cloud silhouette generation during AI 3D model synthesis (Tripo AI style)
  useEffect(() => {
    const isGenerating = Boolean(isExecuting || debugBlueprint);
    const pointCloudGroup = pointCloudGroupRef.current;
    const meshGroup = currentMeshGroupRef.current;

    if (!pointCloudGroup) return;

    if (!isGenerating) {
      // Hide & dispose point cloud when generation completes or aborts
      pointCloudGroup.visible = false;
      if (pointCloudRef.current) {
        pointCloudGroup.remove(pointCloudRef.current);
        disposePointCloud(pointCloudRef.current);
        pointCloudRef.current = null;
      }
      if (meshGroup) {
        meshGroup.visible = true;
      }
      return;
    }

    // Hide real mesh group while generation point cloud is displayed
    if (meshGroup) {
      meshGroup.visible = false;
    }

    let isMounted = true;
    const refImage = generationSettings?.image || textureSettings?.referenceImage;

    const buildPoints = async () => {
      if (pointCloudRef.current) {
        pointCloudGroup.remove(pointCloudRef.current);
        disposePointCloud(pointCloudRef.current);
        pointCloudRef.current = null;
      }

      let points: THREE.Points;
      if (refImage) {
        try {
          points = await createPointCloudFromImage(refImage);
        } catch {
          points = createFallbackPointCloud();
        }
      } else {
        points = createFallbackPointCloud();
      }

      if (!isMounted) {
        disposePointCloud(points);
        return;
      }

      pointCloudRef.current = points;
      pointCloudGroup.add(points);
      pointCloudGroup.visible = true;
    };

    buildPoints();

    return () => {
      isMounted = false;
    };
  }, [isExecuting, debugBlueprint, generationSettings?.image, textureSettings?.referenceImage]);

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
      if (currentAsset) {
        // Procedural high-detail 3D hero model for sample & generated assets without remote URLs
        const modelGroup = new THREE.Group();
        const isDrone = currentAsset.id.includes('drone') || currentAsset.name.toLowerCase().includes('drone');

        if (isDrone) {
          // Cyber Drone Scout
          const coreGeo = new THREE.SphereGeometry(0.75, 32, 24);
          const coreMat = new THREE.MeshStandardMaterial({
            color: 0x222630,
            metalness: 0.85,
            roughness: 0.2,
          });
          const coreMesh = new THREE.Mesh(coreGeo, coreMat);
          coreMesh.castShadow = true;
          coreMesh.receiveShadow = true;
          modelGroup.add(coreMesh);

          const ringGeo = new THREE.TorusGeometry(1.2, 0.07, 16, 64);
          const ringMat = new THREE.MeshStandardMaterial({
            color: 0xF9CF00,
            metalness: 0.9,
            roughness: 0.15,
          });
          const ringMesh = new THREE.Mesh(ringGeo, ringMat);
          ringMesh.rotation.x = Math.PI / 2;
          ringMesh.castShadow = true;
          modelGroup.add(ringMesh);

          for (let i = 0; i < 4; i++) {
            const angle = (i * Math.PI) / 2 + Math.PI / 4;
            const podGeo = new THREE.CylinderGeometry(0.12, 0.18, 0.45, 16);
            const podMat = new THREE.MeshStandardMaterial({ color: 0x3d4454, metalness: 0.7, roughness: 0.3 });
            const podMesh = new THREE.Mesh(podGeo, podMat);
            podMesh.position.set(Math.cos(angle) * 1.1, 0.1, Math.sin(angle) * 1.1);
            podMesh.castShadow = true;
            modelGroup.add(podMesh);
          }
        } else {
          // Mech Sentinel Compound Sculpt
          const baseGeo = new THREE.DodecahedronGeometry(0.85, 1);
          const baseMat = new THREE.MeshStandardMaterial({
            color: 0x272b36,
            metalness: 0.8,
            roughness: 0.25,
          });
          const baseMesh = new THREE.Mesh(baseGeo, baseMat);
          baseMesh.castShadow = true;
          baseMesh.receiveShadow = true;
          modelGroup.add(baseMesh);

          const accentGeo = new THREE.TorusKnotGeometry(0.48, 0.12, 64, 16, 2, 3);
          const accentMat = new THREE.MeshStandardMaterial({
            color: 0xF9CF00,
            metalness: 0.85,
            roughness: 0.15,
          });
          const accentMesh = new THREE.Mesh(accentGeo, accentMat);
          accentMesh.position.y = 0.05;
          accentMesh.castShadow = true;
          modelGroup.add(accentMesh);
        }

        group.add(modelGroup);
        frameCamera(modelGroup);
        computeMeshStats(modelGroup);
      }
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    const load = async () => {
      setIsLoading(true);
      setMeshStats(null);
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
          const arrayBuffer = await response.arrayBuffer();

          // Truncation check for GLB binary format to avoid Three.js typed array length error
          if (format === 'glb' && arrayBuffer.byteLength >= 12) {
            const view = new DataView(arrayBuffer);
            const magic = view.getUint32(0, true);
            if (magic === 0x46546C67) { // 'glTF'
              const declaredLength = view.getUint32(8, true);
              if (declaredLength > arrayBuffer.byteLength) {
                throw new Error(
                  `Model file truncated: received ${arrayBuffer.byteLength} of ${declaredLength} bytes. Please try reloading.`
                );
              }
            }
          }

          const loader = sharedGLTFLoader;
          const gltf = await loader.parseAsync(arrayBuffer, '');
          if (!cancelled) {
            group.add(gltf.scene);
            gltf.scene.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
              }
            });
            frameCamera(gltf.scene);
            computeMeshStats(gltf.scene);
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
          const loader = sharedOBJLoader;
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
            computeMeshStats(object);
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
          const loader = sharedPLYLoader;
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
          computeMeshStats(mesh);
        } else {
          throw new Error(`No browser preview is available for ${currentAsset.format}.`);
        }

        // Auto-generate high-quality thumbnail if not present in the asset
        if (rendererRef.current && sceneRef.current && cameraRef.current && currentAsset && (!currentAsset.thumbnail || currentAsset.thumbnail === '')) {
          requestAnimationFrame(() => {
            if (rendererRef.current && sceneRef.current && cameraRef.current && currentAsset) {
              rendererRef.current.render(sceneRef.current, cameraRef.current);
              const dataUrl = rendererRef.current.domElement.toDataURL('image/jpeg', 0.85);
              if (dataUrl && dataUrl.startsWith('data:image/')) {
                updateAssetProperties(currentAsset.id, { thumbnail: dataUrl });
              }
            }
          });
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
  }, [currentAsset?.id, currentAsset?.source?.viewUrl, currentAsset?.source?.localUrl, currentAsset?.format, viewportResetTrigger]);

  // Dynamic In-Memory Shading Mode Switcher (PBR, Wireframe, Clay, Normal, Matcap, X-Ray) without re-fetching
  useEffect(() => {
    if (!currentMeshGroupRef.current) return;
    const group = currentMeshGroupRef.current;

    group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (!child.userData.originalMaterial) {
          child.userData.originalMaterial = child.material;
        }

        const orig = child.userData.originalMaterial;

        // Dispose previous non-original material to prevent GPU memory leak
        const prevMat = child.material;
        if (prevMat && prevMat !== orig && !child.userData.shadingMaterials?.includes(prevMat)) {
          if (Array.isArray(prevMat)) {
            prevMat.forEach(m => { if (m !== orig) disposeMaterial(m); });
          } else {
            disposeMaterial(prevMat);
          }
        }

        switch (shadingMode) {
          case 'textured':
            child.material = orig;
            if (Array.isArray(child.material)) {
              child.material.forEach(m => { m.wireframe = false; });
            } else if (child.material) {
              child.material.wireframe = false;
            }
            break;

          case 'wireframe':
            child.material = new THREE.MeshStandardMaterial({
              color: 0x00ff88,
              wireframe: true,
              roughness: 0.6,
              metalness: 0.1
            });
            break;

          case 'clay':
            child.material = new THREE.MeshStandardMaterial({
              color: 0xd6d9df,
              roughness: 0.75,
              metalness: 0.05,
              wireframe: false
            });
            break;

          case 'matcap-ceramic':
            child.material = new THREE.MeshStandardMaterial({
              color: 0xffffff,
              roughness: 0.12,
              metalness: 0.05,
              wireframe: false
            });
            break;

          case 'matcap-chrome':
            child.material = new THREE.MeshStandardMaterial({
              color: 0xf0f3f8,
              roughness: 0.04,
              metalness: 0.95,
              wireframe: false
            });
            break;

          case 'matcap-gold':
            child.material = new THREE.MeshStandardMaterial({
              color: 0xf9cf00,
              roughness: 0.22,
              metalness: 0.88,
              wireframe: false
            });
            break;

          case 'matcap-normal':
            child.material = new THREE.MeshNormalMaterial({
              wireframe: false
            });
            break;

          case 'xray':
            child.material = new THREE.MeshBasicMaterial({
              color: 0x3b82f6,
              wireframe: true,
              transparent: true,
              opacity: 0.75
            });
            break;

          case 'matcap-turquoise':
            child.material = new THREE.MeshStandardMaterial({
              color: 0x06b6d4,
              roughness: 0.3,
              metalness: 0.4,
              wireframe: false
            });
            break;

          default:
            child.material = orig;
            break;
        }

        // Track shading materials for cleanup on unmount
        if (!child.userData.shadingMaterials) child.userData.shadingMaterials = [];
        if (child.material !== orig && !child.userData.shadingMaterials.includes(child.material)) {
          child.userData.shadingMaterials.push(child.material);
        }
      }
    });
  }, [shadingMode]);

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

  const handleZoomIn = useCallback(() => {
    if (cameraRef.current && controlsRef.current) {
      const target = controlsRef.current.target;
      const dir = new THREE.Vector3().subVectors(cameraRef.current.position, target);
      const distance = dir.length();
      // Zoom 15% of current distance, but clamp to minDistance
      const zoomAmount = Math.max(distance * 0.15, 0.1);
      dir.normalize().multiplyScalar(zoomAmount);
      cameraRef.current.position.sub(dir);
      // Clamp to min/max
      const newDist = cameraRef.current.position.distanceTo(target);
      if (newDist < controlsRef.current.minDistance) {
        const clamped = dir.normalize().multiplyScalar(controlsRef.current.minDistance);
        cameraRef.current.position.copy(target).add(clamped);
      }
      controlsRef.current.update();
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    if (cameraRef.current && controlsRef.current) {
      const target = controlsRef.current.target;
      const dir = new THREE.Vector3().subVectors(cameraRef.current.position, target);
      // Zoom out 15% of current distance
      dir.multiplyScalar(1.15);
      cameraRef.current.position.addVectors(target, dir);
      // Clamp to maxDistance
      const newDist = cameraRef.current.position.distanceTo(target);
      if (newDist > controlsRef.current.maxDistance) {
        const clamped = dir.normalize().multiplyScalar(controlsRef.current.maxDistance);
        cameraRef.current.position.copy(target).add(clamped);
      }
      controlsRef.current.update();
    }
  }, []);

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

    // Adaptive margin based on model size:
    // Small models (<1): more margin (1.3x) so they don't fill the entire view
    // Medium models (1-5): moderate margin (1.15x)
    // Large models (>5): less margin (1.05x) so they fit comfortably
    const marginFactor = radius < 1 ? 1.3 : radius < 5 ? 1.15 : 1.05;

    const fov = camera.fov * (Math.PI / 180);
    const distance = (radius / Math.sin(fov / 2)) * marginFactor;

    // Clamp to controls min/max with small buffer
    const clampedDistance = Math.max(
      controls.minDistance * 1.2,
      Math.min(controls.maxDistance * 0.9, distance)
    );

    const dir = new THREE.Vector3(1, 0.4, 1).normalize();
    camera.position.copy(center).add(dir.multiplyScalar(clampedDistance));

    camera.near = Math.max(0.01, clampedDistance / 100);
    camera.far = clampedDistance * 100;
    camera.updateProjectionMatrix();

    controls.target.copy(center);
    controls.update();

    // Auto-generate asset thumbnail if missing
    if (rendererRef.current && sceneRef.current && currentAsset && (!currentAsset.thumbnail || currentAsset.thumbnail.length === 0)) {
      const targetId = currentAsset.id;
      setTimeout(() => {
        try {
          if (rendererRef.current && sceneRef.current && cameraRef.current) {
            rendererRef.current.render(sceneRef.current, cameraRef.current);
            const thumb = rendererRef.current.domElement.toDataURL('image/png');
            if (thumb && thumb.length > 50) {
              currentAsset.thumbnail = thumb;
              updateAssetProperties(targetId, { thumbnail: thumb });
            }
          }
        } catch (e) {
          // ignore
        }
      }, 150);
    }
  }, [currentAsset, updateAssetProperties]);

  // Take real 3D viewport screenshot
  const handleScreenshot = () => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;
    try {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
      const dataUrl = rendererRef.current.domElement.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      const cleanName = (currentAsset?.name || 'viewport_3d').toLowerCase().replace(/[^a-z0-9]/g, '_');
      const fileName = `${cleanName}_snapshot_${Date.now()}.png`;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setDropToastMessage(`Captured 3D snapshot: ${fileName}`);
      setTimeout(() => setDropToastMessage(null), 3000);
    } catch (err) {
      console.error('Screenshot failed', err);
    }
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
      const localBlobUrl = URL.createObjectURL(file);

      // Create immediate preview asset
      const tempId = `dropped-${Date.now()}`;
      const tempAsset: ModelAsset = {
        id: tempId,
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
        source: { filename: file.name, subfolder: 'models', type: 'upload', viewUrl: localBlobUrl }
      };

      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
      blobUrlRef.current = localBlobUrl;

      // Load immediately into viewport for smooth UX
      addAsset(tempAsset);
      setCurrentAsset(tempAsset);
      setDropToastMessage(`Saving "${cleanName}" to backend storage...`);

      // Persist to backend storage (/backend/storage/models)
      try {
        const uploadRes = await apiClient.uploadFile<{
          url: string;
          id?: string;
          filename: string;
          stored_filename?: string;
          size: number;
        }>('/api/v1/upload/model', file);

        const serverUrl = uploadRes?.url || `/static/models/${uploadRes?.stored_filename || file.name}`;
        const finalAsset: ModelAsset = {
          ...tempAsset,
          id: uploadRes?.stored_filename || uploadRes?.id || tempId,
          tags: ['Saved to Storage', '3D Model', ext],
          source: {
            filename: uploadRes?.stored_filename || file.name,
            subfolder: 'models',
            type: 'upload',
            viewUrl: serverUrl,
          },
        };
        // Update temp asset in place to avoid duplicate cards in the workspace
        updateAssetProperties(tempId, finalAsset);
        setCurrentAsset(finalAsset);
        setDropToastMessage(`Saved to storage and loaded "${cleanName}"`);
        setTimeout(() => setDropToastMessage(null), 3000);
      } catch (uploadErr) {
        console.warn('Backend storage upload failed, keeping local preview:', uploadErr);
        setDropToastMessage(`Loaded "${cleanName}" (Local preview)`);
        setTimeout(() => setDropToastMessage(null), 3500);
      }
    }
  };

  return (
    <div 
      className={`relative w-full h-full overflow-hidden select-none ${className}`}
      style={{
        background: 'radial-gradient(ellipse at center, #2c303a 0%, #202229 50%, #131418 100%)'
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* 3D Canvas Container */}
      <div ref={containerRef} className="w-full h-full absolute inset-0 cursor-grab active:cursor-grabbing" />

      {/* Drag & Drop Visual Dropzone Overlay */}
      {isDragOver && (
        <div className="absolute inset-0 bg-[#1c1e24]/90 border-2 border-dashed border-[#F9CF00] flex flex-col items-center justify-center z-40 transition-all pointer-events-none">
          <div className="w-16 h-16 rounded-2xl bg-[#F9CF00]/15 border border-[#F9CF00]/40 flex items-center justify-center text-[#F9CF00] shadow-2xl animate-bounce mb-3">
            <UploadCloud className="w-8 h-8" />
          </div>
          <span className="text-base font-bold text-white tracking-wide">
            Drop 3D Asset to Load into Viewport
          </span>
          <span className="text-xs text-zinc-400 mt-1">
            Loads geometry, textures, topology & material configs instantly
          </span>
        </div>
      )}

      {/* Drop Notification Toast */}
      {dropToastMessage && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-[#262932] border border-[#F9CF00]/50 shadow-2xl flex items-center gap-2 text-xs font-semibold text-white animate-in fade-in slide-in-from-top-2 duration-300 max-w-md">
          {dropToastIsHtmlError ? (
            <Search className="w-4 h-4 text-rose-400 flex-shrink-0" />
          ) : (
            <Sparkles className="w-4 h-4 text-[#F9CF00]" />
          )}
          <span className="truncate">{dropToastMessage}</span>
          {dropToastIsHtmlError && (
            <button
              onClick={() => {
                setDropToastMessage(null);
                setDropToastIsHtmlError(false);
                window.dispatchEvent(new CustomEvent('openUploadDiagnostic'));
              }}
              className="ml-2 px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 text-[10px] font-bold flex-shrink-0 transition-colors"
            >
              Diagnose
            </button>
          )}
        </div>
      )}

      {/* Tripo AI-style Interactive 3D Generation HUD */}
      {(isExecuting || debugBlueprint) && (
        <div className="absolute bottom-16 sm:bottom-20 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center pointer-events-auto max-w-md w-full px-4 text-center select-none animate-in fade-in duration-300">
          <div className="flex items-center gap-2 mb-2 drop-shadow-[0_2px_4px_rgba(0,0,0,0.85)]">
            <span className="text-xs sm:text-sm font-semibold text-zinc-100 tracking-wide">
              {isExecuting ? (executionStep || 'Generating...') : 'Generating...'}
            </span>
            <span className="text-xs font-mono font-bold text-[#F9CF00]">
              {Math.round(isExecuting ? (executionProgress || 45) : 48)}%
            </span>
          </div>

          {/* Minimalist Slim Progress Bar (Identical to Tripo AI) */}
          <div className="w-56 sm:w-64 h-1 rounded-full bg-zinc-800/90 overflow-hidden mb-2 shadow-md">
            <div 
              className="h-full bg-gradient-to-r from-zinc-300 via-white to-[#F9CF00] rounded-full transition-all duration-300"
              style={{ width: `${Math.max(5, Math.min(100, isExecuting ? (executionProgress || 45) : 48))}%` }}
            />
          </div>

          <p className="text-[10px] text-zinc-400 max-w-sm leading-relaxed drop-shadow-[0_2px_4px_rgba(0,0,0,0.85)]">
            Use orbit controls to inspect the 3D volumetric preview in real time while neural generation synthesizes geometry.
          </p>

          <button
            onClick={isExecuting ? cancelExecution : () => setDebugBlueprint(false)}
            className="mt-1 text-[10px] text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer underline drop-shadow-sm"
          >
            {isExecuting ? 'Cancel Generation' : 'Close Preview'}
          </button>
        </div>
      )}

      {/* Smooth Non-Intrusive Loading Overlay (Asset file parsing) */}
      {isLoading && !isExecuting && (
        <div className="absolute inset-0 bg-[#14161b]/70 backdrop-blur-sm flex flex-col items-center justify-center z-20 pointer-events-none transition-all duration-200">
          <div className="relative flex items-center justify-center">
            <div className="w-12 h-12 rounded-full border-2 border-zinc-700 border-t-[#F9CF00] animate-spin" />
            <Sparkles className="w-4 h-4 text-[#F9CF00] absolute" />
          </div>
          <div className="mt-3 text-center">
            <span className="text-xs font-bold text-zinc-200 tracking-wide block">
              Loading 3D Model...
            </span>
          </div>
        </div>
      )}

      {/* Empty State Overlay when no asset is active */}
      {!currentAsset && !isLoading && !isExecuting && !debugBlueprint && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none p-4">
          <div className="max-w-xs w-full p-5 rounded-2xl bg-[#14161b]/95 border border-[#272a34] shadow-2xl backdrop-blur-md text-center pointer-events-auto space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-[#1c1f26] border border-[#272a34] flex items-center justify-center mx-auto text-[#F9CF00]">
              <Box className="w-6 h-6 stroke-[2.2]" />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-sm text-white">3D Viewport Ready</h3>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Generate a 3D asset from the left panel, or drag and drop a GLB/OBJ file directly here.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => {
                  setIsLeftPanelOpen(true);
                  setActiveTool('model');
                }}
                className="w-full py-2.5 px-3 rounded-xl bg-[#F9CF00] hover:bg-[#ebd024] text-black font-extrabold text-[11px] flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Generate 3D Asset</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Persistent Viewport Overlays */}
      {showOverlayUI && (
        <>
          {/* Top-Right: Topology HUD & Unobtrusive Zoom/Orbit Controller Set */}
          <div 
            style={{ right: `${rightOffset}px` }} 
            className="absolute top-3.5 z-10 flex items-center gap-2 transition-all duration-200"
          >
            {/* Unobtrusive Corner Zoom / Orbit Controller Set (Tripo Style) */}
            <div className="flex items-center gap-0.5 p-1 rounded-xl bg-[#14161b]/90 backdrop-blur-md border border-[#272a34] shadow-2xl text-zinc-300">
              {/* Orbit/Pan Mode Toggle with Active Visual Indicator */}
              <SimpleTooltip side="bottom" label={`Mode: ${interactionMode === 'pan' ? 'Pan' : 'Orbit'} (Click to toggle)`}>
                <button
                  id="btn-corner-orbit-toggle"
                  onClick={() => setInteractionMode(interactionMode === 'pan' ? 'orbit' : 'pan')}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${
                    interactionMode === 'orbit'
                      ? 'bg-[#1f222a] text-[#F9CF00] border border-[#F9CF00]/40 shadow-sm'
                      : 'bg-[#1f222a] text-zinc-300 hover:text-white'
                  }`}
                >
                  <Compass className="w-3 h-3 text-[#F9CF00]" />
                  <span className="capitalize">{interactionMode}</span>
                </button>
              </SimpleTooltip>

              <div className="w-px h-3.5 bg-[#272a34] mx-0.5" />

              {/* Zoom In */}
              <SimpleTooltip side="bottom" label="Zoom In (+)">
                <button
                  id="btn-corner-zoom-in"
                  onClick={handleZoomIn}
                  className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-[#1f222a] transition-all cursor-pointer"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </SimpleTooltip>

              {/* Zoom Out */}
              <SimpleTooltip side="bottom" label="Zoom Out (-)">
                <button
                  id="btn-corner-zoom-out"
                  onClick={handleZoomOut}
                  className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-[#1f222a] transition-all cursor-pointer"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
              </SimpleTooltip>

              {/* Fit / Focus View */}
              <SimpleTooltip side="bottom" label="Reset Focus / Center (Hotkey: F)">
                <button
                  id="btn-corner-fit-view"
                  onClick={resetCamera}
                  className="p-1 rounded-lg text-zinc-400 hover:text-[#F9CF00] hover:bg-[#1f222a] transition-all cursor-pointer"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </SimpleTooltip>
            </div>

            {/* Topology HUD */}
            <div className="bg-[#14161b]/90 backdrop-blur-md border border-[#272a34] rounded-xl px-3 py-1.5 shadow-2xl flex items-center gap-3 text-xs font-mono">
              <div className="flex items-center gap-1.5">
                <span className="text-zinc-500 text-[10px] uppercase font-semibold">Topology</span>
                <span className="text-[#F9CF00] font-bold text-[10px]">
                  {currentAsset?.topology || (meshStats ? 'Triangle' : '—')}
                </span>
              </div>
              <div className="w-px h-3 bg-[#272a34]" />
              <div className="flex items-center gap-1.5">
                <span className="text-zinc-500 text-[10px] uppercase font-semibold">Geometry</span>
                <span className="text-[#00FF9D] font-bold text-[10px]">
                  {currentAsset?.statsAvailable 
                    ? `${currentAsset.faces.toLocaleString()} / ${currentAsset.vertices.toLocaleString()}` 
                    : meshStats 
                      ? `${meshStats.faces.toLocaleString()} / ${meshStats.vertices.toLocaleString()}`
                      : '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Right Floating Tool Rail (Hand, Move, Camera, Grid, Turntable, Reset, Env) */}
          <div 
            style={{ right: `${rightOffset}px` }} 
            className="absolute top-1/2 -translate-y-1/2 z-10 flex flex-col gap-1.5 bg-[#14161b] border border-[#272a34] p-1.5 rounded-2xl shadow-2xl transition-all duration-200"
          >
            <SimpleTooltip side="left" label={interactionMode === 'move' ? 'Return to Orbit Mode' : 'Move / Translate 3D Model'}>
              <button
                id="btn-viewport-move-tool"
                onClick={() => setInteractionMode(interactionMode === 'move' ? 'orbit' : 'move')}
                className={`p-2 rounded-xl transition-all ${
                  interactionMode === 'move' 
                    ? 'bg-[#F9CF00] text-black font-bold ring-2 ring-[#F9CF00]/40' 
                    : 'text-zinc-300 hover:text-white hover:bg-[#1f222a]'
                }`}
              >
                <Move className="w-4 h-4 stroke-[2.2]" />
              </button>
            </SimpleTooltip>

            <SimpleTooltip side="left" label={interactionMode === 'pan' ? 'Switch to Orbit Mode' : 'Switch to Pan Mode'}>
              <button
                onClick={() => setInteractionMode(interactionMode === 'pan' ? 'orbit' : 'pan')}
                className={`p-2 rounded-xl transition-all ${
                  interactionMode === 'pan' 
                    ? 'bg-[#F9CF00] text-black font-bold' 
                    : 'text-zinc-300 hover:text-white hover:bg-[#1f222a]'
                }`}
              >
                <Hand className="w-4 h-4 stroke-[2.2]" />
              </button>
            </SimpleTooltip>

            <SimpleTooltip side="left" label="Capture 3D Viewport Screenshot">
              <button
                onClick={handleScreenshot}
                className="p-2 rounded-xl text-zinc-300 hover:text-[#F9CF00] hover:bg-[#1f222a] transition-all"
              >
                <Camera className="w-4 h-4 stroke-[2.2]" />
              </button>
            </SimpleTooltip>

            <SimpleTooltip side="left" label={showGrid ? 'Hide Floor Grid' : 'Show Floor Grid'}>
              <button
                onClick={() => setShowGrid(!showGrid)}
                className={`p-2 rounded-xl transition-all ${
                  showGrid 
                    ? 'text-[#F9CF00] bg-[#1f222a]' 
                    : 'text-zinc-300 hover:text-white hover:bg-[#1f222a]'
                }`}
              >
                <GridIcon className="w-4 h-4 stroke-[2.2]" />
              </button>
            </SimpleTooltip>

            <SimpleTooltip side="left" label={isTurntable ? 'Pause Turntable 360°' : 'Start Turntable 360°'}>
              <button
                onClick={() => setIsTurntable(!isTurntable)}
                className={`p-2 rounded-xl transition-all ${
                  isTurntable 
                    ? 'bg-[#F9CF00] text-black font-bold' 
                    : 'text-zinc-300 hover:text-[#F9CF00] hover:bg-[#1f222a]'
                }`}
              >
                <RotateCw className="w-4 h-4 stroke-[2.2]" />
              </button>
            </SimpleTooltip>

            <SimpleTooltip side="left" label="Reset Camera (Hotkey: F)">
              <button
                onClick={resetCamera}
                className="p-2 rounded-xl text-zinc-300 hover:text-white hover:bg-[#1f222a] transition-all"
              >
                <RotateCcw className="w-4 h-4 stroke-[2.2]" />
              </button>
            </SimpleTooltip>

            <SimpleTooltip side="left" label="Environment Settings — Lighting, Grid, Camera">
              <button
                onClick={() => setShowEnvironmentPanel(!showEnvironmentPanel)}
                className={`p-2 rounded-xl transition-all ${
                  showEnvironmentPanel
                    ? 'bg-[#F9CF00] text-black font-bold' 
                    : 'text-zinc-300 hover:text-white hover:bg-[#1f222a]'
                }`}
              >
                <Sun className="w-4 h-4 stroke-[2.2]" />
              </button>
            </SimpleTooltip>
          </div>

          {/* Environment Settings Panel */}
          {showEnvironmentPanel && (
            <div 
              style={{ right: `${rightOffset + 56}px` }} 
              className="absolute top-1/2 -translate-y-1/2 z-20 w-72 bg-[#14161b] border border-[#272a34] rounded-2xl shadow-2xl p-4 space-y-3 transition-all duration-200"
            >
              <h3 className="text-[10px] font-bold tracking-wider text-[#F9CF00] uppercase">Environment Settings</h3>

              {/* Presets Section */}
              <div className="space-y-1.5">
                <span className="text-[9px] font-semibold text-zinc-400 uppercase tracking-wider">Presets</span>
                <div className="flex flex-wrap gap-1.5">
                  {ENVIRONMENT_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => applyPreset(preset.id)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all ${
                        selectedPreset === preset.id
                          ? 'bg-[#F9CF00] text-black shadow-md font-bold'
                          : 'bg-[#1e2129] text-zinc-300 border border-[#2c303d] hover:border-[#F9CF00]/50 hover:text-[#F9CF00]'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Lighting Section */}
              <div className="space-y-2">
                <span className="text-[9px] font-semibold text-zinc-400 uppercase tracking-wider">Lighting</span>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-zinc-400">Ambient</span>
                    <span className="text-[9px] font-mono text-[#F9CF00]">{environmentSettings.ambientIntensity.toFixed(1)}</span>
                  </div>
                  <input type="range" min={0} max={3} step={0.1} value={environmentSettings.ambientIntensity} onChange={(e) => patchEnv({ ambientIntensity: parseFloat(e.target.value) })} className="w-full h-1 rounded-full bg-zinc-700 appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#F9CF00]" />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-zinc-400">Key Light</span>
                    <span className="text-[9px] font-mono text-[#F9CF00]">{environmentSettings.keyLightIntensity.toFixed(1)}</span>
                  </div>
                  <input type="range" min={0} max={5} step={0.1} value={environmentSettings.keyLightIntensity} onChange={(e) => patchEnv({ keyLightIntensity: parseFloat(e.target.value) })} className="w-full h-1 rounded-full bg-zinc-700 appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#F9CF00]" />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-zinc-400">Fill Light</span>
                    <span className="text-[9px] font-mono text-[#F9CF00]">{environmentSettings.fillLightIntensity.toFixed(1)}</span>
                  </div>
                  <input type="range" min={0} max={4} step={0.1} value={environmentSettings.fillLightIntensity} onChange={(e) => patchEnv({ fillLightIntensity: parseFloat(e.target.value) })} className="w-full h-1 rounded-full bg-zinc-700 appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#F9CF00]" />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-zinc-400">Rim Light</span>
                    <span className="text-[9px] font-mono text-[#F9CF00]">{environmentSettings.rimLightIntensity.toFixed(1)}</span>
                  </div>
                  <input type="range" min={0} max={4} step={0.1} value={environmentSettings.rimLightIntensity} onChange={(e) => patchEnv({ rimLightIntensity: parseFloat(e.target.value) })} className="w-full h-1 rounded-full bg-zinc-700 appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#F9CF00]" />
                </div>
              </div>

              {/* Exposure Section */}
              <div className="space-y-1.5">
                <span className="text-[9px] font-semibold text-zinc-400 uppercase tracking-wider">Camera</span>
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-zinc-400">Exposure</span>
                  <span className="text-[9px] font-mono text-[#F9CF00]">{environmentSettings.exposure.toFixed(2)}</span>
                </div>
                <input type="range" min={0.5} max={3} step={0.05} value={environmentSettings.exposure} onChange={(e) => patchEnv({ exposure: parseFloat(e.target.value) })} className="w-full h-1 rounded-full bg-zinc-700 appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#F9CF00]" />
              </div>

              {/* Grid Toggle */}
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-zinc-400">Show Grid</span>
                <button onClick={() => patchEnv({ gridVisible: !environmentSettings.gridVisible })} className={`w-7 h-3.5 rounded-full transition-colors relative ${environmentSettings.gridVisible ? 'bg-[#F9CF00]' : 'bg-zinc-700'}`}>
                  <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-zinc-900 transition-transform ${environmentSettings.gridVisible ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                </button>
              </div>

              {/* Reset to Defaults */}
              <button onClick={() => setEnvironmentSettings({ ambientIntensity: 1.2, keyLightIntensity: 3.0, fillLightIntensity: 1.8, rimLightIntensity: 2.5, exposure: 1.5, gridVisible: true, gridColor: '#333333', backgroundColor: '#22242a', autoRotate: false, showAxes: true, showStats: true })} className="w-full py-1.5 rounded-lg text-[9px] font-semibold text-zinc-300 bg-[#1e2129] border border-[#2c303d] hover:border-[#F9CF00]/50 hover:text-[#F9CF00] transition-colors">
                Reset to Defaults
              </button>
            </div>
          )}

          {/* Shading Material Swatches & Bottom Transport Bar (Hidden during generation preview) */}
          {!isExecuting && !debugBlueprint && (
            <>
              <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-10">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-[#14161b] border border-[#272a34] shadow-2xl">
              {/* Textured / PBR */}
              <SimpleTooltip side="top" label="PBR Textured">
                <button
                  onClick={() => setShadingMode('textured')}
                  className={`w-7 h-7 rounded-full overflow-hidden border-2 transition-transform ${
                    shadingMode === 'textured' ? 'border-[#F9CF00] scale-110 shadow-md ring-2 ring-[#F9CF00]/30' : 'border-transparent hover:scale-105 opacity-80 hover:opacity-100'
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
                    <div className="w-full h-full bg-gradient-to-br from-amber-500 to-amber-700" />
                  )}
                </button>
              </SimpleTooltip>

              {/* Clay */}
              <SimpleTooltip side="top" label="Matte Clay">
                <button
                  onClick={() => setShadingMode('clay')}
                  className={`w-7 h-7 rounded-full bg-[#a3a8b5] border-2 transition-transform ${
                    shadingMode === 'clay' ? 'border-[#F9CF00] scale-110 shadow-md ring-2 ring-[#F9CF00]/30' : 'border-transparent hover:scale-105 opacity-80 hover:opacity-100'
                  }`}
                />
              </SimpleTooltip>

              {/* White Ceramic */}
              <SimpleTooltip side="top" label="Ceramic Gloss">
                <button
                  onClick={() => setShadingMode('matcap-ceramic')}
                  className={`w-7 h-7 rounded-full bg-white border-2 transition-transform ${
                    shadingMode === 'matcap-ceramic' ? 'border-[#F9CF00] scale-110 shadow-md ring-2 ring-[#F9CF00]/30' : 'border-transparent hover:scale-105 opacity-80 hover:opacity-100'
                  }`}
                />
              </SimpleTooltip>

              {/* Chrome Metallic */}
              <SimpleTooltip side="top" label="Chrome Metallic">
                <button
                  onClick={() => setShadingMode('matcap-chrome')}
                  className={`w-7 h-7 rounded-full bg-gradient-to-tr from-zinc-600 via-zinc-300 to-white border-2 transition-transform ${
                    shadingMode === 'matcap-chrome' ? 'border-[#F9CF00] scale-110 shadow-md ring-2 ring-[#F9CF00]/30' : 'border-transparent hover:scale-105 opacity-80 hover:opacity-100'
                  }`}
                />
              </SimpleTooltip>

              {/* Wireframe */}
              <SimpleTooltip side="top" label="Topology Wireframe">
                <button
                  onClick={() => setShadingMode('wireframe')}
                  className={`w-7 h-7 rounded-full bg-[#181a20] border-2 flex items-center justify-center text-[10px] text-[#00FF9D] font-bold transition-transform ${
                    shadingMode === 'wireframe' ? 'border-[#F9CF00] scale-110 shadow-md ring-2 ring-[#F9CF00]/30' : 'border-transparent hover:scale-105 opacity-80 hover:opacity-100'
                  }`}
                >
                  #
                </button>
              </SimpleTooltip>

              {/* Normal Map */}
              <SimpleTooltip side="top" label="Tangent Normals">
                <button
                  onClick={() => setShadingMode('matcap-normal')}
                  className={`w-7 h-7 rounded-full bg-gradient-to-br from-pink-500 via-purple-500 to-cyan-400 border-2 transition-transform ${
                    shadingMode === 'matcap-normal' ? 'border-[#F9CF00] scale-110 shadow-md ring-2 ring-[#F9CF00]/30' : 'border-transparent hover:scale-105 opacity-80 hover:opacity-100'
                  }`}
                />
              </SimpleTooltip>

              {/* Gold Matcap */}
              <SimpleTooltip side="top" label="Gold Lustre">
                <button
                  onClick={() => setShadingMode('matcap-gold')}
                  className={`w-7 h-7 rounded-full bg-gradient-to-br from-[#F9CF00] to-amber-600 border-2 transition-transform ${
                    shadingMode === 'matcap-gold' ? 'border-[#F9CF00] scale-110 shadow-md ring-2 ring-[#F9CF00]/30' : 'border-transparent hover:scale-105 opacity-80 hover:opacity-100'
                  }`}
                />
              </SimpleTooltip>

              {/* X-Ray */}
              <SimpleTooltip side="top" label="X-Ray Silhouette">
                <button
                  onClick={() => setShadingMode('xray')}
                  className={`w-7 h-7 rounded-full bg-blue-950 border border-blue-500/50 border-2 transition-transform flex items-center justify-center text-[9px] text-blue-400 font-bold ${
                    shadingMode === 'xray' ? 'border-[#F9CF00] scale-110 shadow-md ring-2 ring-[#F9CF00]/30' : 'border-transparent hover:scale-105 opacity-80 hover:opacity-100'
                  }`}
                >
                  X
                </button>
              </SimpleTooltip>

              {/* Turquoise Stylized */}
              <SimpleTooltip side="top" label="Turquoise Gem">
                <button
                  onClick={() => setShadingMode('matcap-turquoise')}
                  className={`w-7 h-7 rounded-full bg-gradient-to-br from-cyan-400 to-teal-600 border-2 transition-transform ${
                    shadingMode === 'matcap-turquoise' ? 'border-[#F9CF00] scale-110 shadow-md ring-2 ring-[#F9CF00]/30' : 'border-transparent hover:scale-105 opacity-80 hover:opacity-100'
                  }`}
                />
              </SimpleTooltip>
            </div>
          </div>

          {/* Bottom Transport Control Bar */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2">
            {/* Free Orbit / Camera Presets Dropdown */}
            <div className="relative">
              <button
                onClick={() => setCameraMenuOpen(!cameraMenuOpen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#14161b] border border-[#272a34] text-xs font-semibold text-zinc-200 hover:text-white hover:border-[#F9CF00]/50 shadow-2xl transition-all"
              >
                <RotateCw className="w-3.5 h-3.5 text-[#F9CF00]" />
                <span className="capitalize">{cameraPreset} View</span>
                <ChevronDown className="w-3 h-3 text-zinc-400" />
              </button>

              {cameraMenuOpen && (
                <div className="absolute bottom-full left-0 mb-1.5 w-40 py-1 rounded-xl bg-[#181b22] border border-[#272a34] shadow-2xl z-50 text-xs">
                  {(['perspective', 'front', 'back', 'top', 'bottom', 'left', 'right'] as CameraViewPreset[]).map((p) => (
                    <button
                      key={p}
                      onClick={() => applyCameraPreset(p)}
                      className={`w-full text-left px-3 py-1.5 capitalize hover:bg-[#222630] transition-colors flex items-center justify-between ${
                        cameraPreset === p ? 'text-[#F9CF00] font-bold' : 'text-zinc-300'
                      }`}
                    >
                      <span>{p}</span>
                      {cameraPreset === p && <Check className="w-3 h-3 text-[#F9CF00]" />}
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
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#14161b] border border-[#272a34] text-xs font-semibold text-zinc-300 hover:text-white hover:border-[#F9CF00]/50 shadow-2xl transition-all"
            >
              <span>Snap</span>
            </button>

            {/* 3D Print Preparation */}
            <button
              onClick={() => setIsExportModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#14161b] border border-[#272a34] text-xs font-semibold text-zinc-300 hover:text-white hover:border-[#F9CF00]/50 shadow-2xl transition-all"
            >
              <Printer className="w-3.5 h-3.5 text-[#F9CF00]" />
              <span>3D Print</span>
            </button>

            {/* Direct Export 3D Bundle Button (Gray & Yellow Theme) */}
            <button
              onClick={() => setIsExportModalOpen(true)}
              className="flex items-center gap-2 px-4 py-1.5 rounded-xl bg-[#F9CF00] hover:bg-[#ebd024] text-black text-xs font-bold shadow-2xl shadow-[#F9CF00]/25 active:scale-95 transition-all"
            >
              <Download className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Export</span>
            </button>
          </div>
            </>
          )}
        </>
      )}
    </div>
  );
};


