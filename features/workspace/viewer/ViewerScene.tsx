"use client";


import { useRef, useEffect, useState, useCallback, Suspense } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, Environment, Center, Float, Html, useProgress, Preload, Octahedron, useGLTF } from '@react-three/drei';
import { Mesh, Group, Box3, Vector3 } from 'three';
import { registerResetCamera } from '@/stores/useUIStore';
import { useUIStore } from '@/stores/useUIStore';
import { useGenerationStore } from '@/stores/useGenerationStore';

function LoadingScreen() {
  const { progress } = useProgress();
  return (
    <Html center>
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-2 border-[hsl(var(--neon-purple)/0.3)] border-t-[hsl(var(--neon-purple))] rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">{progress.toFixed(0)}%</p>
      </div>
    </Html>
  );
}

function GeneratedModel({ url, wireframe }: { url: string; wireframe: boolean }) {
  const { scene } = useGLTF(url);
  const groupRef = useRef<Group>(null);
  const { camera } = useThree();

  useEffect(() => {
    if (groupRef.current) {
      groupRef.current.traverse((child) => {
        if ((child as Mesh).isMesh) {
          const mesh = child as Mesh;
          if (mesh.material) {
            const mat = mesh.material as any;
            mat.wireframe = wireframe;
          }
        }
      });

      // Calculate bounding box to center and frame the model
      if (groupRef.current) {
        const box = new Box3().setFromObject(groupRef.current);
        const center = box.getCenter(new Vector3());
        const size = box.getSize(new Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;

        // Position model to be centered and properly framed
        groupRef.current.position.sub(center);
        groupRef.current.position.y += size.y * 0.5; // Sit on "ground"

        // Store initial position for potential reset
        groupRef.current.userData.initialPosition = groupRef.current.position.clone();

        // Auto-frame the camera so the model is visible without manual zoom
        const fov = (camera as any).fov ?? 45;
        const distance = (maxDim / 2 / Math.tan((fov * Math.PI) / 360)) * 1.6;
        camera.position.set(0, size.y * 0.5 + maxDim * 0.2, distance);
        camera.lookAt(0, size.y * 0.5, 0);
        const controls = (window as any).__orbitControls;
        if (controls) {
          controls.target.set(0, size.y * 0.5, 0);
          controls.update();
        }
      }
    }
  }, [wireframe, scene]);

  return (
    <group ref={groupRef}>
      <primitive object={scene} />
    </group>
  );
}

function UserModel({ url, wireframe }: { url: string; wireframe: boolean }) {
  const { scene } = useGLTF(url, '/three-default/material.ball');
  const groupRef = useRef<Group>(null);
  const { camera } = useThree();
  useEffect(() => {
    if (groupRef.current) {
      groupRef.current.traverse((child) => {
        if ((child as Mesh).isMesh) {
          const mesh = child as Mesh;
          if (mesh.material) { (mesh.material as any).wireframe = wireframe; }
        }
      });
      const box = new Box3().setFromObject(groupRef.current);
      const size = box.getSize(new Vector3());
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const fov = (camera as any).fov ?? 45;
      const distance = (maxDim / 2 / Math.tan((fov * Math.PI) / 360)) * 1.6;
      camera.position.set(0, size.y * 0.5 + maxDim * 0.2, distance);
      camera.lookAt(0, size.y * 0.5, 0);
      const controls = (window as any).__orbitControls;
      if (controls) {
        controls.target.set(0, size.y * 0.5, 0);
        controls.update();
      }
    }
  }, [wireframe, scene]);
  return <group ref={groupRef}><primitive object={scene} /></group>;
}

function DemoModel({ wireframe }: { wireframe: boolean }) {
  const meshRef = useRef<Mesh>(null);
  return (
    <group>
      <mesh ref={meshRef}>
        <torusKnotGeometry args={[1, 0.35, 256, 64]} />
        <meshStandardMaterial color="#bd76ff" roughness={0.3} metalness={0.7} wireframe={wireframe} envMapIntensity={1.5} />
      </mesh>
    </group>
  );
}

function PlaceholderModel({ wireframe }: { wireframe: boolean }) {
  return (
    <Float speed={1.5} rotationIntensity={0.3} floatIntensity={0.5}>
      <group>
        <Octahedron args={[1.2, 0]}>
          <meshStandardMaterial color="#9151ff" roughness={0.12} metalness={0.8} wireframe={wireframe} />
        </Octahedron>
      </group>
    </Float>
  );
}

function CameraController({ autoRotate }: { autoRotate: boolean }) {
  const { camera } = useThree();
  const orbitRef = useRef<any>(null);

  useEffect(() => {
    registerResetCamera(() => {
      if (orbitRef.current) orbitRef.current.reset();
      camera.position.set(0, 3, 6);
    });
  }, [camera]);

  useEffect(() => {
    const controls = orbitRef.current;
    (window as any).__orbitControls = controls;
    return () => {
      if ((window as any).__orbitControls === controls) {
        (window as any).__orbitControls = null;
      }
    };
  }, []);

  return (
    <OrbitControls ref={orbitRef} autoRotate={autoRotate} autoRotateSpeed={1.5} enableDamping dampingFactor={0.08} minDistance={1.5} maxDistance={15} makeDefault />
  );
}

function SceneGrid({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <Grid position={[0, -1.8, 0]} args={[20, 20]} cellSize={0.5} cellThickness={0.5} cellColor="#2a1a4a" sectionSize={2.5} sectionThickness={1} sectionColor="#7c3aed" fadeDistance={20} fadeStrength={1} infiniteGrid />
  );
}

export function ViewerScene() {
  const { viewer } = useUIStore();
  const { currentJob } = useGenerationStore();
  const hasModel = currentJob?.status === 'completed' && currentJob.result;
  const modelUrl = currentJob?.result?.downloadUrls?.glb || currentJob?.result?.modelUrl;
  const [userModelUrl, setUserModelUrl] = useState<string | null>(null);

  const handleLoadGlb = useCallback((e: CustomEvent) => {
    setUserModelUrl(e.detail.url);
  }, []);

  useEffect(() => {
    window.addEventListener('load-glb-model', handleLoadGlb as EventListener);
    return () => { window.removeEventListener('load-glb-model', handleLoadGlb as EventListener); };
  }, [handleLoadGlb]);

  return (
    <>
      <CameraController autoRotate={viewer.autoRotate} />
      <ambientLight intensity={1.0} />

        <directionalLight
          position={[10, 10, 5]}
          intensity={2.0}
          castShadow
        />

        <directionalLight
          position={[-10, -10, -5]}
          intensity={1.0}
          color="#8b5cf6"
        />

        <directionalLight
          position={[0, 5, 8]}
          intensity={1.2}
          color="#ffffff"
        />
      <Environment preset="studio" />
      <Center>
        {userModelUrl ? (
          <Suspense fallback={<LoadingScreen />}>
            <UserModel url={userModelUrl} wireframe={viewer.showWireframe} />
          </Suspense>
        ) : hasModel && modelUrl ? (
          <Suspense fallback={<LoadingScreen />}>
            <GeneratedModel url={modelUrl} wireframe={viewer.showWireframe} />
          </Suspense>
        ) : hasModel ? (
          <DemoModel wireframe={viewer.showWireframe} />
        ) : (
          <PlaceholderModel wireframe={viewer.showWireframe} />
        )}
      </Center>
      <SceneGrid visible={viewer.showGrid} />
      <Preload all />
    </>
  );
}
