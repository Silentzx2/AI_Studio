'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { toast } from 'sonner';
import {
  Hand,
  Camera,
  Grid as GridIcon,
  RotateCcw,
  RotateCw,
  Compass,
  Mountain,
  Box,
  Layers,
} from 'lucide-react';
import type { ViewportMode } from '../types';
import { SimpleTooltip } from '@/components/ui/simple-tooltip';

interface WorldMeshViewerProps {
  mode: ViewportMode;
  showGrid: boolean;
  turntable: boolean;
  onToggleGrid: () => void;
  onToggleTurntable: () => void;
  modelUrl?: string | null;
}

export const WorldMeshViewer: React.FC<WorldMeshViewerProps> = ({
  mode,
  showGrid,
  turntable,
  onToggleGrid,
  onToggleTurntable,
  modelUrl,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const terrainRef = useRef<THREE.Group | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const animRef = useRef<number | null>(null);
  const turntableRef = useRef(turntable);
  const needsRenderRef = useRef(true);

  const [interaction, setInteraction] = useState<'orbit' | 'pan'>('orbit');

  useEffect(() => {
    turntableRef.current = turntable;
  }, [turntable]);

  // React to grid visibility changes
  useEffect(() => {
    if (gridRef.current) {
      gridRef.current.visible = showGrid;
    }
    needsRenderRef.current = true;
  }, [showGrid]);

  // Wire interaction mode (orbit/pan) to OrbitControls
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    if (interaction === 'pan') {
      controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
      controls.touches.ONE = THREE.TOUCH.PAN;
    } else {
      controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
      controls.touches.ONE = THREE.TOUCH.ROTATE;
    }
  }, [interaction]);

  // React to view mode changes (world/terrain/wireframe)
  useEffect(() => {
    const terrain = terrainRef.current;
    if (!terrain) return;

    if (mode === 'terrain') {
      terrain.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          const isGround = obj.geometry instanceof THREE.BoxGeometry && obj.position.y < 0;
          obj.visible = isGround || obj.name === 'world-terrain';
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m) => {
            if ('wireframe' in m) m.wireframe = false;
          });
        }
      });
    } else if (mode === 'wireframe') {
      terrain.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.visible = true;
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m) => {
            if ('wireframe' in m) m.wireframe = true;
          });
        }
      });
    } else {
      terrain.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.visible = true;
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m) => {
            if ('wireframe' in m) m.wireframe = false;
          });
        }
      });
    }
    needsRenderRef.current = true;
  }, [mode]);

  // Build a low-poly procedural world preview (static terrain mesh).
  // ponytail: this is a decorative placeholder mesh only — it holds a fixed
  // seed so the scene is deterministic. Real WorldGen mesh generation is out
  // of scope (UI-only page). Upgrade path: load generated GLB via the upload.
  const buildTerrain = useCallback((group: THREE.Group) => {
    const terrain = new THREE.Group();
    terrain.name = 'world-terrain';

    const ground = new THREE.Mesh(
      new THREE.BoxGeometry(4, 0.06, 4),
      new THREE.MeshStandardMaterial({ color: 0x1b1e26, roughness: 0.9 })
    );
    ground.position.y = -0.08;
    terrain.add(ground);

    const mat = new THREE.MeshStandardMaterial({
      color: 0x2a2f3a,
      roughness: 0.85,
      flatShading: true,
    });
    const seed = 17;
    const rand = (i: number) => {
      const x = Math.sin(i * 127.1 + seed) * 43758.5453;
      return x - Math.floor(x);
    };
    const spots: [number, number][] = [
      [ -0.9, -0.9 ], [ 0.4, -0.7 ], [ 0.9, 0.6 ],
      [ -0.6, 0.8 ], [ 0.1, 0.2 ], [ -0.2, -0.4 ],
    ];
    spots.forEach(([sx, sz], i) => {
      const h = 0.15 + rand(i) * 0.5;
      const block = new THREE.Mesh(new THREE.BoxGeometry(0.5, h, 0.5), mat);
      block.position.set(sx, h / 2 - 0.03, sz);
      block.rotation.y = rand(i + 100) * Math.PI;
      terrain.add(block);
    });

    const treeMat = new THREE.MeshStandardMaterial({ color: 0x343b49, roughness: 0.8 });
    for (let i = 0; i < 14; i++) {
      const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.06), treeMat);
      const tx = rand(i) * 3.2 - 1.6;
      const tz = rand(i + 40) * 3.2 - 1.6;
      trunk.position.set(tx, 0.22, tz);
      terrain.add(trunk);
      const crown = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), mat);
      crown.position.set(tx, 0.55, tz);
      crown.rotation.y = rand(i + 300) * Math.PI;
      terrain.add(crown);
    }

    terrain.traverse((obj) => {
      if (obj instanceof THREE.Mesh) obj.receiveShadow = true;
    });
    group.add(terrain);
    return terrain;
  }, []);

  const resetCamera = useCallback(() => {
    const cam = cameraRef.current;
    const target = controlsRef.current?.target;
    if (!cam) return;
    cam.position.set(2.4, 1.6, 2.4);
    if (target) target.set(0, 0.2, 0);
    controlsRef.current?.update();
    needsRenderRef.current = true;
  }, []);

  const fitToScreen = useCallback(() => {
    const cam = cameraRef.current;
    if (!cam) return;
    cam.position.set(1.6, 1.0, 1.6);
    if (controlsRef.current?.target) controlsRef.current.target.set(0, 0.2, 0);
    controlsRef.current?.update();
    needsRenderRef.current = true;
  }, []);

  const handleScreenshot = useCallback(() => {
    rendererRef.current?.render(sceneRef.current!, cameraRef.current!);
    const url = rendererRef.current?.domElement.toDataURL('image/png');
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = 'worldgen-preview.png';
    a.click();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0c10);
    scene.fog = new THREE.Fog(0x0b0c10, 6, 16);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(2.4, 1.6, 2.4);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.info.autoReset = false;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxDistance = 12;
    controls.minDistance = 0.6;
    controls.target.set(0, 0.2, 0);
    controlsRef.current = controls;

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const key = new THREE.DirectionalLight(0xfff2d9, 1.8);
    key.position.set(4, 6, 4);
    key.castShadow = true;
    key.shadow.mapSize.width = 1024;
    key.shadow.mapSize.height = 1024;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x6f84ff, 0.6);
    fill.position.set(-4, 2, -3);
    scene.add(fill);

    const world = new THREE.Group();
    scene.add(world);
    buildTerrain(world);
    terrainRef.current = world;

    const grid = new THREE.GridHelper(8, 20, 0x2c3140, 0x1a1e2a);
    grid.position.y = 0;
    scene.add(grid);
    gridRef.current = grid;

    const timer = new THREE.Timer();
    const animate = () => {
      if (!needsRenderRef.current && !turntableRef.current) return;
      timer.update();
      if (turntableRef.current && world) {
        world.rotation.y += timer.getDelta() * 0.35;
      }
      controls.update();
      renderer.info.reset();
      renderer.render(scene, camera);
      needsRenderRef.current = false;
    };
    renderer.setAnimationLoop(animate);

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
      renderer.setAnimationLoop(null);
      if (animRef.current) cancelAnimationFrame(animRef.current);
      resizeObserver.disconnect();
      controls.dispose();
      world.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const m = obj.material as THREE.Material | THREE.Material[];
          if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
          else m.dispose();
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [buildTerrain]);

  // Fit camera to loaded model
  const fitCameraToObject = useCallback((object: THREE.Object3D) => {
    const cam = cameraRef.current;
    const controls = controlsRef.current;
    if (!cam || !controls) return;

    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = cam.fov * (Math.PI / 180);
    let cameraZ = maxDim / (2 * Math.tan(fov / 2));
    cameraZ *= 2.5; // padding

    cam.position.set(center.x + cameraZ, center.y + cameraZ * 0.6, center.z + cameraZ);
    controls.target.copy(center);
    controls.update();
    needsRenderRef.current = true;
  }, []);

  // Load generated model when modelUrl changes
  useEffect(() => {
    if (!modelUrl || !sceneRef.current) return;
    const scene = sceneRef.current;

    // Remove previous model
    const prev = scene.getObjectByName('worldgen_model');
    if (prev) {
      prev.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const m = obj.material as THREE.Material | THREE.Material[];
          if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
          else m.dispose();
        }
      });
      scene.remove(prev);
    }

    const isGLB = modelUrl.endsWith('.glb') || modelUrl.endsWith('.gltf');
    const isPLY = modelUrl.endsWith('.ply');

    if (isPLY) {
      new PLYLoader().load(
        modelUrl,
        (geometry) => {
          geometry.computeVertexNormals();
          const material = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, flatShading: true });
          const mesh = new THREE.Mesh(geometry, material);
          mesh.name = 'worldgen_model';

          // Center and scale to unit size
          geometry.computeBoundingBox();
          const box = geometry.boundingBox!;
          const center = box.getCenter(new THREE.Vector3());
          mesh.position.sub(center);

          scene.add(mesh);
          fitCameraToObject(mesh);
        },
        undefined,
        (err) => {
          console.error('PLY load error:', err);
          toast.error('Failed to load PLY model');
        },
      );
    } else if (isGLB) {
      new GLTFLoader().load(
        modelUrl,
        (gltf) => {
          const model = gltf.scene;
          model.name = 'worldgen_model';
          scene.add(model);
          fitCameraToObject(model);
        },
        undefined,
        (err) => {
          console.error('GLB load error:', err);
          toast.error('Failed to load GLB model');
        },
      );
    } else {
      // Unsupported format — show toast but don't crash
      toast.error(`Unsupported model format: ${modelUrl.split('.').pop()}`);
    }
  }, [modelUrl, fitCameraToObject]);

  return (
    <div className="relative w-full h-full overflow-hidden select-none">
      <div
        ref={containerRef}
        className="w-full h-full absolute inset-0 cursor-grab active:cursor-grabbing"
      />

      {/* HUD: Topology + Orientation (matches reference) */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-3">
        <div className="bg-[var(--ws-hud-bg,#12141a)]/90 backdrop-blur-md border border-[var(--ws-hud-border,#232733)] rounded-xl px-3.5 py-2 shadow-xl space-y-1 text-xs font-mono">
          <div className="flex items-center justify-between gap-4">
            <span className="text-[var(--ws-text-muted,#8e95a5)] text-[11px]">World</span>
            <span className="text-[var(--ws-text,#f3f4f6)] font-semibold text-[11px] capitalize">
              {mode}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-[var(--ws-text-muted,#8e95a5)] text-[11px]">Terrain</span>
            <span className="text-[#22c55e] font-semibold text-[11px]">Ready</span>
          </div>
        </div>

        <SimpleTooltip label="Reset Camera">
          <button
            onClick={resetCamera}
            className="w-11 h-11 rounded-xl bg-[var(--ws-hud-bg,#12141a)]/90 backdrop-blur-md border border-[var(--ws-hud-border,#232733)] flex items-center justify-center cursor-pointer hover:border-[#f5c518] shadow-xl group transition-all"
          >
            <div className="relative w-6 h-6 flex items-center justify-center">
              <span className="text-[9px] font-bold text-[#ef4444] absolute -top-1">Y</span>
              <span className="text-[9px] font-bold text-[#22c55e] absolute -right-1">X</span>
              <span className="text-[9px] font-bold text-[#3b82f6] absolute -bottom-1">Z</span>
              <div className="w-2 h-2 rounded-full bg-[#f5c518] group-hover:scale-125 transition-transform" />
            </div>
          </button>
        </SimpleTooltip>
      </div>

      {/* Right floating tool rail */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-1.5 bg-[var(--ws-hud-bg,#12141a)]/90 backdrop-blur-md border border-[var(--ws-hud-border,#232733)] p-1.5 rounded-2xl shadow-2xl">
        <SimpleTooltip label={interaction === 'orbit' ? 'Switch to Pan Mode' : 'Switch to Orbit Mode'}>
          <button
            onClick={() => setInteraction(interaction === 'orbit' ? 'pan' : 'orbit')}
            className={`p-2 rounded-xl transition-all ${
              interaction === 'pan'
                ? 'bg-[#f5c518] text-[#111216]'
                : 'text-[var(--ws-text-muted,#8e95a5)] hover:text-[var(--ws-text,#f3f4f6)] hover:bg-[var(--ws-hover-bg,#1f232e)]'
            }`}
          >
            <Hand className="w-4 h-4" />
          </button>
        </SimpleTooltip>
        <SimpleTooltip label="Capture Viewport Screenshot">
          <button
            onClick={handleScreenshot}
            className="p-2 rounded-xl text-[var(--ws-text-muted,#8e95a5)] hover:text-[var(--ws-text,#f3f4f6)] hover:bg-[var(--ws-hover-bg,#1f232e)] transition-all"
          >
            <Camera className="w-4 h-4" />
          </button>
        </SimpleTooltip>
        <SimpleTooltip label={showGrid ? 'Hide Floor Grid' : 'Show Floor Grid'}>
          <button
            onClick={onToggleGrid}
            className={`p-2 rounded-xl transition-all ${
              showGrid
                ? 'text-[#f5c518] bg-[var(--ws-active-bg,#1a1d26)]'
                : 'text-[var(--ws-text-muted,#8e95a5)] hover:text-[var(--ws-text,#f3f4f6)] hover:bg-[var(--ws-hover-bg,#1f232e)]'
            }`}
          >
            <GridIcon className="w-4 h-4" />
          </button>
        </SimpleTooltip>
        <SimpleTooltip label={turntable ? 'Pause Turntable' : 'Start Turntable'}>
          <button
            onClick={onToggleTurntable}
            className={`p-2 rounded-xl transition-all ${
              turntable
                ? 'bg-[#f5c518] text-[#111216]'
                : 'text-[var(--ws-text-muted,#8e95a5)] hover:text-[var(--ws-text,#f3f4f6)] hover:bg-[var(--ws-hover-bg,#1f232e)]'
            }`}
          >
            <RotateCw className="w-4 h-4" />
          </button>
        </SimpleTooltip>
        <SimpleTooltip label="Reset Camera">
          <button
            onClick={resetCamera}
            className="p-2 rounded-xl text-[var(--ws-text-muted,#8e95a5)] hover:text-[var(--ws-text,#f3f4f6)] hover:bg-[var(--ws-hover-bg,#1f232e)] transition-all"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </SimpleTooltip>
        <SimpleTooltip label="Frame World">
          <button
            onClick={fitToScreen}
            className="p-2 rounded-xl text-[var(--ws-text-muted,#8e95a5)] hover:text-[var(--ws-text,#f3f4f6)] hover:bg-[var(--ws-hover-bg,#1f232e)] transition-all"
          >
            <Compass className="w-4 h-4" />
          </button>
        </SimpleTooltip>
      </div>

      {/* Bottom center view mode switcher */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--ws-hud-bg,#12141a)]/95 backdrop-blur-md border border-[var(--ws-hud-border,#232733)] shadow-2xl">
          {([
            { id: 'world', label: 'World', Icon: Box },
            { id: 'terrain', label: 'Terrain', Icon: Mountain },
            { id: 'wireframe', label: 'Wire', Icon: Layers },
          ] as const).map(({ id, label, Icon }) => (
            <SimpleTooltip key={id} label={`View: ${label}`}>
              <button
                className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition-all ${
                  mode === id
                    ? 'bg-[#f5c518] text-[#111216]'
                    : 'text-[var(--ws-text-muted,#8e95a5)] hover:text-[var(--ws-text,#f3f4f6)] hover:bg-[var(--ws-hover-bg,#1f232e)]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            </SimpleTooltip>
          ))}
        </div>
      </div>
    </div>
  );
};

export default WorldMeshViewer;
