'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import {
  MousePointer,
  Move,
  RotateCw,
  Maximize,
  Bone,
  Brush,
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  ChevronDown,
  Grid,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Lock,
  Eye,
  Compass,
} from 'lucide-react';
import { useWorkspace } from '../store/WorkspaceContext';
import { useAnimationStore, ViewportGizmoTool, ViewportRenderMode, CameraPreset } from '@/stores/useAnimationStore';
import { SimpleTooltip } from '@/components/ui/simple-tooltip';
import { toast } from 'sonner';

export const AnimationViewportStage: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const { currentAsset } = useWorkspace();
  const {
    activeViewportTool,
    setActiveViewportTool,
    renderMode,
    setRenderMode,
    cameraPreset,
    setCameraPreset,
    displayOptions,
    toggleDisplayOption,
    isPlaying,
    togglePlay,
    setIsPlaying,
    currentTime,
    setCurrentTime,
    duration,
    fps,
    setFps,
    timeFormat,
    setTimeFormat,
    timelineZoom,
    setTimelineZoom,
    tracks,
    setActiveMode,
    setInspectorTab,
    setIsExportModalOpen,
    rigStatus,
    setRigStatus,
    selectedBone,
    setSelectedBone,
    boneRotations,
  } = useAnimationStore();

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [cameraDropdownOpen, setCameraDropdownOpen] = useState(false);
  const [fpsDropdownOpen, setFpsDropdownOpen] = useState(false);

  // Three.js instances ref
  const threeRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    characterGroup: THREE.Group;
    skeletonGroup: THREE.Group;
    gridHelper: THREE.GridHelper;
    currentMixer: THREE.AnimationMixer | null;
    currentAction: THREE.AnimationAction | null;
    bonesMap: Map<string, THREE.Bone>;
  } | null>(null);

  // Initialize Three.js Viewport
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const canvas = canvasRef.current;
    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#14161B');

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 1.4, 3.2);

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Orbit Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 1.0, 0);
    controls.maxPolarAngle = Math.PI / 2 + 0.1;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xfffaed, 2.2);
    keyLight.position.set(2.5, 4.0, 3.0);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xa5c4ff, 0.8);
    fillLight.position.set(-3.0, 2.0, -2.0);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xf9cf00, 1.2);
    rimLight.position.set(0, 3.0, -3.0);
    scene.add(rimLight);

    // Grid Floor
    const gridHelper = new THREE.GridHelper(10, 20, 0x3b4252, 0x1f232b);
    gridHelper.position.y = 0;
    scene.add(gridHelper);

    // Ground plane (subtle dark disc)
    const groundGeo = new THREE.CircleGeometry(4, 32);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x111317,
      roughness: 0.85,
      metalness: 0.1,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.001;
    ground.receiveShadow = true;
    scene.add(ground);

    // Character Group & Glowing Skeleton Group
    const characterGroup = new THREE.Group();
    scene.add(characterGroup);

    const skeletonGroup = new THREE.Group();
    scene.add(skeletonGroup);

    const bonesMap = new Map<string, THREE.Bone>();

    threeRef.current = {
      scene,
      camera,
      renderer,
      controls,
      characterGroup,
      skeletonGroup,
      gridHelper,
      currentMixer: null,
      currentAction: null,
      bonesMap,
    };

    // Build procedural default biped humanoid character & glowing skeleton
    buildProceduralBiped(characterGroup, skeletonGroup, bonesMap);

    // Resize observer
    const handleResize = () => {
      if (!container || !camera || !renderer) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Animation Loop
    let animationFrameId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const delta = clock.getDelta();

      controls.update();

      const { isPlaying, currentTime, duration, setCurrentTime, playbackSpeed, isLooping } =
        useAnimationStore.getState();

      if (isPlaying) {
        let nextTime = currentTime + delta * playbackSpeed;
        if (nextTime >= duration) {
          if (isLooping) {
            nextTime = 0;
          } else {
            nextTime = duration;
            setIsPlaying(false);
          }
        }
        setCurrentTime(nextTime);

        // Procedurally animate bones if in playback
        animateProceduralBones(bonesMap, nextTime);
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      controls.dispose();
      renderer.dispose();
    };
  }, []);

  // Update Display Toggles (Grid, Skeleton)
  useEffect(() => {
    if (!threeRef.current) return;
    const { gridHelper, skeletonGroup } = threeRef.current;
    gridHelper.visible = displayOptions.showGrid;
    skeletonGroup.visible = displayOptions.showSkeleton;
  }, [displayOptions.showGrid, displayOptions.showSkeleton]);

  // Update Shading Mode (Solid, Wireframe, Skeleton)
  useEffect(() => {
    if (!threeRef.current) return;
    const { characterGroup, skeletonGroup } = threeRef.current;

    characterGroup.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (mat) {
          if (renderMode === 'wireframe') {
            mat.wireframe = true;
            mesh.visible = true;
          } else if (renderMode === 'skeleton') {
            mesh.visible = false;
          } else {
            mat.wireframe = false;
            mesh.visible = true;
          }
        }
      }
    });

    if (renderMode === 'skeleton') {
      skeletonGroup.visible = true;
    }
  }, [renderMode]);

  // Update Camera Preset
  useEffect(() => {
    if (!threeRef.current) return;
    const { camera, controls } = threeRef.current;
    if (cameraPreset === 'front') {
      camera.position.set(0, 1.2, 3.2);
    } else if (cameraPreset === 'side') {
      camera.position.set(3.2, 1.2, 0);
    } else if (cameraPreset === 'top') {
      camera.position.set(0, 4.0, 0.1);
    } else {
      camera.position.set(1.5, 1.8, 2.8);
    }
    controls.target.set(0, 1.0, 0);
    controls.update();
  }, [cameraPreset]);

  // Handle Timeline Scrubbing
  const handleTimelineMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsScrubbing(true);
    handleTimelineScrub(e);
  };

  const handleTimelineScrub = useCallback(
    (e: React.MouseEvent<HTMLDivElement> | MouseEvent) => {
      if (!timelineRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const progress = x / rect.width;
      const newTime = progress * duration;
      setCurrentTime(newTime);

      if (threeRef.current) {
        animateProceduralBones(threeRef.current.bonesMap, newTime);
      }
    },
    [duration, setCurrentTime]
  );

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (isScrubbing) handleTimelineScrub(e);
    };
    const onMouseUp = () => setIsScrubbing(false);

    if (isScrubbing) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isScrubbing, handleTimelineScrub]);

  // Format time readout
  const formatTime = (seconds: number) => {
    if (timeFormat === 'frames') {
      return `F ${Math.round(seconds * fps)}`;
    }
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(2);
    return `${mins.toString().padStart(2, '0')}:${secs.padStart(5, '0')}`;
  };

  // Helper for Procedural Biped Skeleton construction
  const buildProceduralBiped = (
    characterGroup: THREE.Group,
    skeletonGroup: THREE.Group,
    bonesMap: Map<string, THREE.Bone>
  ) => {
    // Stylized Cyber Character Model (Torso, Pelvis, Limbs, Head)
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x1f232b,
      roughness: 0.35,
      metalness: 0.65,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: 0xf9cf00,
      roughness: 0.2,
      metalness: 0.8,
      emissive: 0xf9cf00,
      emissiveIntensity: 0.15,
    });

    // Torso
    const torsoGeo = new THREE.CylinderGeometry(0.18, 0.14, 0.5, 12);
    const torso = new THREE.Mesh(torsoGeo, bodyMat);
    torso.position.set(0, 1.25, 0);
    torso.castShadow = true;
    characterGroup.add(torso);

    // Chest armor plate
    const chestPlateGeo = new THREE.BoxGeometry(0.32, 0.25, 0.18);
    const chestPlate = new THREE.Mesh(chestPlateGeo, accentMat);
    chestPlate.position.set(0, 1.35, 0.05);
    characterGroup.add(chestPlate);

    // Head / Visor
    const headGeo = new THREE.SphereGeometry(0.12, 16, 16);
    const head = new THREE.Mesh(headGeo, bodyMat);
    head.position.set(0, 1.68, 0);
    characterGroup.add(head);

    const visorGeo = new THREE.BoxGeometry(0.18, 0.06, 0.12);
    const visor = new THREE.Mesh(visorGeo, accentMat);
    visor.position.set(0, 1.68, 0.08);
    characterGroup.add(visor);

    // Limbs
    const limbGeo = new THREE.CylinderGeometry(0.06, 0.05, 0.38, 8);

    // Left Arm
    const armL = new THREE.Mesh(limbGeo, bodyMat);
    armL.position.set(0.32, 1.25, 0);
    armL.rotation.z = -0.15;
    characterGroup.add(armL);

    // Right Arm
    const armR = new THREE.Mesh(limbGeo, bodyMat);
    armR.position.set(-0.32, 1.25, 0);
    armR.rotation.z = 0.15;
    characterGroup.add(armR);

    // Legs
    const legL = new THREE.Mesh(limbGeo, bodyMat);
    legL.position.set(0.14, 0.65, 0);
    characterGroup.add(legL);

    const legR = new THREE.Mesh(limbGeo, bodyMat);
    legR.position.set(-0.14, 0.65, 0);
    characterGroup.add(legR);

    // Glowing Biped Skeleton Overlay (amber glowing joints & bones)
    const bonePoints: [string, [number, number, number]][] = [
      ['Hips', [0, 1.0, 0]],
      ['Spine', [0, 1.22, 0]],
      ['Chest', [0, 1.45, 0]],
      ['Neck', [0, 1.58, 0]],
      ['Head', [0, 1.72, 0]],
      ['UpperArm_L', [0.24, 1.42, 0]],
      ['LowerArm_L', [0.45, 1.22, 0]],
      ['Hand_L', [0.62, 1.05, 0]],
      ['UpperArm_R', [-0.24, 1.42, 0]],
      ['LowerArm_R', [-0.45, 1.22, 0]],
      ['Hand_R', [-0.62, 1.05, 0]],
      ['UpperLeg_L', [0.14, 0.95, 0]],
      ['LowerLeg_L', [0.14, 0.52, 0]],
      ['Foot_L', [0.14, 0.08, 0.08]],
      ['UpperLeg_R', [-0.14, 0.95, 0]],
      ['LowerLeg_R', [-0.14, 0.52, 0]],
      ['Foot_R', [-0.14, 0.08, 0.08]],
    ];

    const boneBoneConnections: [string, string][] = [
      ['Hips', 'Spine'],
      ['Spine', 'Chest'],
      ['Chest', 'Neck'],
      ['Neck', 'Head'],
      ['Chest', 'UpperArm_L'],
      ['UpperArm_L', 'LowerArm_L'],
      ['LowerArm_L', 'Hand_L'],
      ['Chest', 'UpperArm_R'],
      ['UpperArm_R', 'LowerArm_R'],
      ['LowerArm_R', 'Hand_R'],
      ['Hips', 'UpperLeg_L'],
      ['UpperLeg_L', 'LowerLeg_L'],
      ['LowerLeg_L', 'Foot_L'],
      ['Hips', 'UpperLeg_R'],
      ['UpperLeg_R', 'LowerLeg_R'],
      ['LowerLeg_R', 'Foot_R'],
    ];

    const jointMat = new THREE.MeshBasicMaterial({ color: 0xffe033 });
    const jointGeo = new THREE.SphereGeometry(0.024, 8, 8);

    const positionsMap = new Map<string, THREE.Vector3>();

    bonePoints.forEach(([name, pos]) => {
      const jointMesh = new THREE.Mesh(jointGeo, jointMat);
      jointMesh.position.set(pos[0], pos[1], pos[2]);
      jointMesh.name = `joint_${name}`;
      skeletonGroup.add(jointMesh);
      positionsMap.set(name, jointMesh.position);

      const bone = new THREE.Bone();
      bone.name = name;
      bone.position.set(pos[0], pos[1], pos[2]);
      bonesMap.set(name, bone);
    });

    const boneLineMat = new THREE.LineBasicMaterial({
      color: 0xf9cf00,
      linewidth: 2,
      transparent: true,
      opacity: 0.85,
    });

    boneBoneConnections.forEach(([p1, p2]) => {
      const pos1 = positionsMap.get(p1);
      const pos2 = positionsMap.get(p2);
      if (pos1 && pos2) {
        const lineGeo = new THREE.BufferGeometry().setFromPoints([pos1, pos2]);
        const line = new THREE.Line(lineGeo, boneLineMat);
        line.name = `bone_${p1}_${p2}`;
        skeletonGroup.add(line);
      }
    });
  };

  // Procedural bone movement driven by animation timeline
  const animateProceduralBones = (bonesMap: Map<string, THREE.Bone>, time: number) => {
    const cycle = Math.sin(time * Math.PI * 2);
    const cosCycle = Math.cos(time * Math.PI * 2);

    const armL = bonesMap.get('UpperArm_L');
    if (armL) armL.rotation.x = cycle * 0.35;

    const armR = bonesMap.get('UpperArm_R');
    if (armR) armR.rotation.x = -cycle * 0.35;

    const legL = bonesMap.get('UpperLeg_L');
    if (legL) legL.rotation.x = -cycle * 0.45;

    const legR = bonesMap.get('UpperLeg_R');
    if (legR) legR.rotation.x = cycle * 0.45;

    const hips = bonesMap.get('Hips');
    if (hips) hips.position.y = 1.0 + Math.abs(cosCycle) * 0.04;
  };

  const currentScrubPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex-1 h-full flex flex-col min-w-0 bg-[#0F1014] overflow-hidden select-none">
      {/* 3D VIEWPORT CANVAS AREA */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden bg-[#14161B]">
        <canvas ref={canvasRef} className="w-full h-full block cursor-grab active:cursor-grabbing" />

        {/* LEFT VIEWPORT TOOL STRIP */}
        <div className="absolute left-3 top-3 z-10 flex flex-col gap-1 p-1 bg-[#16181D]/90 backdrop-blur-md border border-white/[0.08] rounded-xl shadow-xl">
          {[
            { id: 'select', icon: <MousePointer className="w-4 h-4" />, label: 'Select (Q)' },
            { id: 'move', icon: <Move className="w-4 h-4" />, label: 'Move (W)' },
            { id: 'rotate', icon: <RotateCw className="w-4 h-4" />, label: 'Rotate (E)' },
            { id: 'scale', icon: <Maximize className="w-4 h-4" />, label: 'Scale (R)' },
            { id: 'bone', icon: <Bone className="w-4 h-4" />, label: 'Bone Tool (B)' },
            { id: 'weight', icon: <Brush className="w-4 h-4" />, label: 'Paint Weights (P)' },
          ].map((tool) => {
            const isActive = activeViewportTool === tool.id;
            return (
              <SimpleTooltip key={tool.id} side="right" label={tool.label}>
                <button
                  onClick={() => setActiveViewportTool(tool.id as ViewportGizmoTool)}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[#F9CF00] text-black shadow-md'
                      : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
                  }`}
                >
                  {tool.icon}
                </button>
              </SimpleTooltip>
            );
          })}
        </div>

        {/* TOP LEFT OVERLAY CONTROLS (Camera & Grid) */}
        <div className="absolute top-3 left-14 z-10 flex items-center gap-2">
          {/* Camera Perspective Dropdown */}
          <div className="relative">
            <button
              onClick={() => setCameraDropdownOpen(!cameraDropdownOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#16181D]/90 backdrop-blur-md border border-white/[0.08] text-xs font-semibold text-zinc-300 hover:text-white hover:border-white/[0.18] transition-all cursor-pointer shadow-md"
            >
              <Compass className="w-3.5 h-3.5 text-[#F9CF00]" />
              <span className="capitalize">{cameraPreset}</span>
              <ChevronDown className="w-3 h-3 text-zinc-500" />
            </button>
            {cameraDropdownOpen && (
              <div className="absolute left-0 mt-1 w-32 bg-[#1A1D24] border border-white/[0.1] rounded-xl shadow-2xl p-1 z-30">
                {(['perspective', 'front', 'side', 'top'] as CameraPreset[]).map((cam) => (
                  <button
                    key={cam}
                    onClick={() => {
                      setCameraPreset(cam);
                      setCameraDropdownOpen(false);
                    }}
                    className={`w-full px-2.5 py-1.5 text-xs text-left rounded-lg capitalize transition-colors ${
                      cameraPreset === cam
                        ? 'bg-[#F9CF00] text-black font-bold'
                        : 'text-zinc-300 hover:text-white hover:bg-white/[0.06]'
                    }`}
                  >
                    {cam}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Grid Toggle */}
          <SimpleTooltip label="Toggle Ground Grid">
            <button
              onClick={() => toggleDisplayOption('showGrid')}
              className={`p-2 rounded-xl bg-[#16181D]/90 backdrop-blur-md border transition-all cursor-pointer shadow-md ${
                displayOptions.showGrid
                  ? 'border-[#F9CF00]/40 text-[#F9CF00]'
                  : 'border-white/[0.08] text-zinc-400 hover:text-white'
              }`}
            >
              <Grid className="w-3.5 h-3.5" />
            </button>
          </SimpleTooltip>
        </div>

        {/* TOP RIGHT OVERLAY CONTROLS (Shading & Fullscreen) */}
        <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
          {/* Shading Mode Selector Pills */}
          <div className="flex items-center bg-[#16181D]/90 backdrop-blur-md border border-white/[0.08] rounded-xl p-0.5 shadow-md">
            {(['solid', 'wireframe', 'skeleton'] as ViewportRenderMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setRenderMode(mode)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold capitalize transition-all cursor-pointer ${
                  renderMode === mode
                    ? 'bg-[#F9CF00] text-black shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          {/* Fullscreen Toggle */}
          <SimpleTooltip label="Toggle Fullscreen">
            <button
              onClick={() => {
                if (!document.fullscreenElement) {
                  containerRef.current?.requestFullscreen?.();
                  setIsFullscreen(true);
                } else {
                  document.exitFullscreen?.();
                  setIsFullscreen(false);
                }
              }}
              className="p-2 rounded-xl bg-[#16181D]/90 backdrop-blur-md border border-white/[0.08] text-zinc-400 hover:text-white transition-all cursor-pointer shadow-md"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </SimpleTooltip>
        </div>

        {/* ACTIVE RIG STATUS PILL (Floating Bottom-Left above Timeline) */}
        <div className="absolute bottom-3 left-3 z-10 pointer-events-none">
          <div className="px-3 py-1 bg-[#121418]/90 backdrop-blur-md border border-white/[0.08] rounded-full flex items-center gap-2 shadow-lg">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] font-semibold text-zinc-300">
              {rigStatus === 'rigged' ? 'Humanoid Biped (17 Bones)' : 'Unrigged Mesh'}
            </span>
          </div>
        </div>
      </div>

      {/* MULTI-TRACK NLA TIMELINE (Docked at Bottom of Viewport) */}
      <div className="h-[210px] bg-[#121418] border-t border-white/[0.08] flex flex-col flex-shrink-0">
        {/* Playback Control Bar */}
        <div className="h-10 px-4 bg-[#16181D] border-b border-white/[0.06] flex items-center justify-between">
          {/* Left: Transport Buttons */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentTime(0)}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              aria-label="Skip to start"
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={togglePlay}
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                isPlaying
                  ? 'bg-[#F9CF00] text-black font-bold shadow-[0_0_12px_rgba(249,207,0,0.3)]'
                  : 'bg-[#22252C] text-white hover:bg-[#2C3038]'
              }`}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause className="w-3.5 h-3.5 fill-current" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
              )}
            </button>
            <button
              onClick={() => {
                setIsPlaying(false);
                setCurrentTime(0);
              }}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              aria-label="Stop"
            >
              <Square className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setCurrentTime(duration)}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              aria-label="Skip to end"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>

            {/* Time / Duration Readout */}
            <div className="ml-3 font-mono text-xs font-bold text-zinc-200 bg-[#0F1014] px-2.5 py-1 rounded-md border border-white/[0.06]">
              <span className="text-[#F9CF00]">{formatTime(currentTime)}</span>
              <span className="text-zinc-600 mx-1.5">/</span>
              <span className="text-zinc-400">{formatTime(duration)}</span>
            </div>
          </div>

          {/* Right: Timeline Settings (FPS, Time Format, Zoom) */}
          <div className="flex items-center gap-3">
            {/* FPS Selector */}
            <div className="relative">
              <button
                onClick={() => setFpsDropdownOpen(!fpsDropdownOpen)}
                className="flex items-center gap-1 text-[11px] font-semibold text-zinc-300 hover:text-white px-2 py-1 rounded-md bg-[#1E2129] border border-white/[0.06] cursor-pointer"
              >
                <span>{fps} FPS</span>
                <ChevronDown className="w-3 h-3 text-zinc-500" />
              </button>
              {fpsDropdownOpen && (
                <div className="absolute right-0 bottom-full mb-1 w-24 bg-[#1E2129] border border-white/[0.1] rounded-lg shadow-xl p-1 z-30">
                  {[20, 24, 30, 60].map((f) => (
                    <button
                      key={f}
                      onClick={() => {
                        setFps(f);
                        setFpsDropdownOpen(false);
                      }}
                      className={`w-full text-left px-2 py-1 rounded text-xs transition-colors ${
                        fps === f ? 'bg-[#F9CF00] text-black font-bold' : 'text-zinc-300 hover:bg-white/[0.06]'
                      }`}
                    >
                      {f} FPS
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Time / Frames toggle */}
            <button
              onClick={() => setTimeFormat(timeFormat === 'time' ? 'frames' : 'time')}
              className="text-[11px] font-semibold text-zinc-400 hover:text-zinc-200 px-2 py-1 rounded bg-[#1E2129] border border-white/[0.06] cursor-pointer"
            >
              {timeFormat === 'time' ? 'Time' : 'Frames'}
            </button>

            {/* Zoom Slider */}
            <div className="flex items-center gap-1.5">
              <ZoomOut className="w-3 h-3 text-zinc-500" />
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={timelineZoom}
                onChange={(e) => setTimelineZoom(parseFloat(e.target.value))}
                className="w-16 h-1 bg-[#282B33] rounded-lg appearance-none cursor-pointer accent-[#F9CF00]"
              />
              <ZoomIn className="w-3 h-3 text-zinc-500" />
            </div>
          </div>
        </div>

        {/* Tracks Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Track Headers Column */}
          <div className="w-36 bg-[#14161B] border-r border-white/[0.06] flex flex-col divide-y divide-white/[0.04] text-[11px]">
            {/* Top Empty Header (ruler align) */}
            <div className="h-6 px-3 flex items-center font-bold text-zinc-500 text-[10px] uppercase">
              Tracks
            </div>
            {tracks.map((track) => (
              <div
                key={track.id}
                className="h-6 px-3 flex items-center justify-between text-zinc-300 hover:bg-white/[0.02]"
              >
                <div className="flex items-center gap-1.5 truncate">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: track.color }} />
                  <span className="truncate font-medium">{track.name}</span>
                </div>
                <div className="flex items-center gap-1 text-zinc-600 opacity-60 hover:opacity-100">
                  <Eye className="w-2.5 h-2.5 cursor-pointer hover:text-white" />
                  <Lock className="w-2.5 h-2.5 cursor-pointer hover:text-white" />
                </div>
              </div>
            ))}
          </div>

          {/* Timeline Ruler & Lanes (Scrubber) */}
          <div
            ref={timelineRef}
            onMouseDown={handleTimelineMouseDown}
            className="flex-1 relative overflow-x-hidden overflow-y-auto cursor-crosshair divide-y divide-white/[0.04]"
          >
            {/* Time Ruler */}
            <div className="h-6 bg-[#16181D] relative border-b border-white/[0.06]">
              {/* Second Markers */}
              {Array.from({ length: 11 }).map((_, i) => {
                const sec = (i * 0.25).toFixed(2);
                const pct = (parseFloat(sec) / duration) * 100;
                if (pct > 100) return null;
                return (
                  <div
                    key={sec}
                    style={{ left: `${pct}%` }}
                    className="absolute top-0 bottom-0 flex flex-col justify-between border-l border-white/[0.1] pl-1 pointer-events-none"
                  >
                    <span className="text-[9px] font-mono text-zinc-500">{sec}s</span>
                    <div className="w-px h-1.5 bg-white/[0.15]" />
                  </div>
                );
              })}
            </div>

            {/* Lanes for each track */}
            {tracks.map((track) => {
              // Track-specific segment styling matching reference mockup
              let clipBg = 'bg-blue-600/25 border-blue-500/40 text-blue-300';
              let clipLabel = '';
              let clipWidth = '100%';
              if (track.name === 'Character') {
                clipBg = 'bg-purple-600/35 border-purple-500/50 text-purple-200';
                clipLabel = 'Run (Baked Clip)';
                clipWidth = '95%';
              } else if (track.name === 'Body') {
                clipBg = 'bg-blue-600/30 border-blue-500/40 text-blue-200';
                clipWidth = '80%';
              } else if (track.name === 'Arms') {
                clipBg = 'bg-emerald-600/30 border-emerald-500/40 text-emerald-200';
                clipWidth = '75%';
              } else if (track.name === 'Legs') {
                clipBg = 'bg-teal-600/30 border-teal-500/40 text-teal-200';
                clipWidth = '90%';
              } else if (track.name === 'Face') {
                clipBg = 'bg-amber-600/30 border-amber-500/40 text-amber-200';
                clipWidth = '40%';
              } else if (track.name === 'Root') {
                clipBg = 'bg-sky-600/25 border-sky-500/40 text-sky-200';
                clipWidth = '85%';
              } else if (track.name === 'IK') {
                clipBg = 'bg-rose-600/25 border-rose-500/40 text-rose-200';
                clipWidth = '90%';
              }

              return (
                <div key={track.id} className="h-6 relative bg-[#121418] hover:bg-white/[0.01]">
                  {/* Colored Clip Segment Pill */}
                  <div
                    style={{ left: '0%', width: clipWidth }}
                    className={`absolute top-1 bottom-1 rounded-md border flex items-center px-2 pointer-events-none transition-all ${clipBg}`}
                  >
                    {clipLabel && (
                      <span className="text-[10px] font-bold truncate">
                        {clipLabel}
                      </span>
                    )}
                  </div>

                  {/* Keyframe Diamonds */}
                  {track.keyframeTimes.map((time) => {
                    const pct = duration > 0 ? (time / duration) * 100 : 0;
                    return (
                      <div
                        key={time}
                        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rotate-45 border border-white shadow-sm transition-transform hover:scale-150 cursor-pointer z-10"
                        style={{
                          left: `${pct}%`,
                          backgroundColor: track.color || '#F9CF00',
                        }}
                      />
                    );
                  })}
                </div>
              );
            })}

            {/* Vertical Playhead Scrubber Line */}
            <div
              style={{ left: `${currentScrubPercent}%` }}
              className="absolute top-0 bottom-0 w-0.5 bg-[#F9CF00] z-20 pointer-events-none shadow-[0_0_8px_rgba(249,207,0,0.8)]"
            >
              {/* Playhead Top Handle */}
              <div className="w-3.5 h-3.5 -ml-[6px] -mt-1 bg-[#F9CF00] rounded-sm rotate-45 flex items-center justify-center shadow-lg" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
