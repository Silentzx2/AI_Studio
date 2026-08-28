import React, { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { ShadingMode, ModelAsset } from '../types';

interface CompareViewportProps {
  asset: ModelAsset | null;
  shadingMode: ShadingMode;
  showWireframe: boolean;
  showGrid: boolean;
  syncCamera?: boolean;
  externalCameraState?: { position: THREE.Vector3; target: THREE.Vector3 } | null;
  onCameraChange?: (state: { position: THREE.Vector3; target: THREE.Vector3 }) => void;
  label: string;
}

export const CompareViewport: React.FC<CompareViewportProps> = ({
  asset,
  shadingMode,
  showWireframe,
  showGrid,
  syncCamera = false,
  externalCameraState = null,
  onCameraChange,
  label,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const meshGroupRef = useRef<THREE.Group | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const isUserInteractingRef = useRef(false);

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const width = container.clientWidth || 400;
    const height = container.clientHeight || 300;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f1015);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 1.2, 3.8);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
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

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.maxDistance = 25;
    controls.minDistance = 0.8;
    controls.target.set(0, 0.4, 0);
    controlsRef.current = controls;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const mainKeyLight = new THREE.DirectionalLight(0xfff5ea, 2.2);
    mainKeyLight.position.set(4, 6, 5);
    mainKeyLight.castShadow = true;
    mainKeyLight.shadow.mapSize.width = 1024;
    mainKeyLight.shadow.mapSize.height = 1024;
    mainKeyLight.shadow.bias = -0.0001;
    scene.add(mainKeyLight);

    const fillLight = new THREE.DirectionalLight(0x90b0ff, 1.2);
    fillLight.position.set(-5, 3, -3);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xfff0d0, 1.8);
    rimLight.position.set(0, 5, -6);
    scene.add(rimLight);

    // Grid
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

    const meshGroup = new THREE.Group();
    scene.add(meshGroup);
    meshGroupRef.current = meshGroup;

    // Animation loop
    const timer = new THREE.Timer();
    const animate = () => {
      animFrameIdRef.current = requestAnimationFrame(animate);
      timer.update();
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize handling
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

    // Track user interaction for camera sync
    const handleStart = () => { isUserInteractingRef.current = true; };
    const handleEnd = () => {
      isUserInteractingRef.current = false;
      if (onCameraChange && cameraRef.current && controlsRef.current) {
        onCameraChange({
          position: cameraRef.current.position.clone(),
          target: controlsRef.current.target.clone(),
        });
      }
    };
    renderer.domElement.addEventListener('pointerdown', handleStart);
    renderer.domElement.addEventListener('pointerup', handleEnd);
    renderer.domElement.addEventListener('wheel', handleEnd);

    return () => {
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', handleStart);
      renderer.domElement.removeEventListener('pointerup', handleEnd);
      renderer.domElement.removeEventListener('wheel', handleEnd);
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync camera from external source
  useEffect(() => {
    if (!syncCamera || !externalCameraState || !cameraRef.current || !controlsRef.current) return;
    if (isUserInteractingRef.current) return;

    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    cam.position.copy(externalCameraState.position);
    ctrl.target.copy(externalCameraState.target);
    cam.updateProjectionMatrix();
    ctrl.update();
  }, [syncCamera, externalCameraState]);

  // Update grid visibility
  useEffect(() => {
    if (gridHelperRef.current) {
      gridHelperRef.current.visible = showGrid;
    }
  }, [showGrid]);

  // Frame camera to fit object
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

  // Load asset into viewport
  useEffect(() => {
    if (!sceneRef.current || !meshGroupRef.current) return;
    const group = meshGroupRef.current;

    // Clear existing mesh
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

    if (!asset?.source?.viewUrl && !asset?.source?.localUrl) return;

    let cancelled = false;

    const load = async () => {
      try {
        const sourceUrl = asset.source?.localUrl || asset.source?.viewUrl;
        if (!sourceUrl) return;

        const format = asset.format.toLowerCase();
        if (format === 'glb' || format === 'gltf') {
          const loader = new GLTFLoader();
          const gltf = await loader.loadAsync(sourceUrl);
          if (!cancelled) {
            group.add(gltf.scene);
            gltf.scene.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                applyShadingToMesh(child);
              }
            });
            frameCamera(gltf.scene);
          }
        } else if (format === 'obj') {
          const loader = new OBJLoader();
          const object = await loader.loadAsync(sourceUrl);
          if (!cancelled) {
            object.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                applyShadingToMesh(child);
              }
            });
            group.add(object);
            frameCamera(object);
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
            wireframe: showWireframe || shadingMode === 'wireframe',
          });
          const mesh = new THREE.Mesh(geometry, material);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          group.add(mesh);
          frameCamera(mesh);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Compare viewport load failed', error);
        }
      }
    };

    void load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset?.id, asset?.source?.viewUrl, asset?.source?.localUrl, asset?.format]);

  // Apply shading mode to mesh
  const applyShadingToMesh = (mesh: THREE.Mesh) => {
    if (shadingMode === 'wireframe' || showWireframe) {
      mesh.material = new THREE.MeshStandardMaterial({
        color: 0xd0d5dc,
        wireframe: true,
        roughness: 0.75,
        metalness: 0.05,
      });
    } else if (shadingMode === 'clay') {
      mesh.material = new THREE.MeshStandardMaterial({
        color: 0x8c919d,
        roughness: 0.9,
        metalness: 0.0,
        wireframe: false,
      });
    } else if (shadingMode === 'matcap-chrome') {
      mesh.material = new THREE.MeshStandardMaterial({
        color: 0xcbd5e1,
        roughness: 0.1,
        metalness: 1.0,
        wireframe: false,
      });
    } else if (shadingMode === 'matcap-gold') {
      mesh.material = new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        roughness: 0.3,
        metalness: 1.0,
        wireframe: false,
      });
    } else if (shadingMode === 'xray') {
      mesh.material = new THREE.MeshStandardMaterial({
        color: 0x1f2937,
        roughness: 0.5,
        metalness: 0.0,
        transparent: true,
        opacity: 0.6,
        wireframe: false,
      });
    }
  };

  // Re-apply shading when mode changes
  useEffect(() => {
    if (!meshGroupRef.current) return;
    meshGroupRef.current.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        applyShadingToMesh(child);
      }
    });
  }, [shadingMode, showWireframe]);

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden border border-[#21242c]">
      {/* Label overlay */}
      <div className="absolute top-2 left-2 z-10 px-2 py-1 rounded-lg bg-[#12141a]/90 backdrop-blur-sm border border-[#232733] text-[10px] font-bold text-[#f5c518]">
        {label}
      </div>
      <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
    </div>
  );
};
