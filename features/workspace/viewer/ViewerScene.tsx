"use client";


import { useRef, useEffect, useState, useCallback, Suspense } from 'react';
import { useFrame, useThree, useLoader } from '@react-three/fiber';
import { OrbitControls, Grid, Environment, Center, Float, Html, useProgress, Preload, Octahedron, useGLTF } from '@react-three/drei';
import { Mesh, Group, Box3, Vector3 } from 'three';
import { FBXLoader, OBJLoader, STLLoader } from 'three-stdlib';
import { registerResetCamera } from '@/stores/useUIStore';
import { useUIStore } from '@/stores/useUIStore';
import { useGenerationStore } from '@/stores/useGenerationStore';
import { useThemeStore } from '@/stores/useThemeStore';
import { useViewerStore } from '@/stores/useViewerStore';

function disposeObject(object) {
  if (object.isMesh) {
    if (object.geometry) object.geometry.dispose();
    if (object.material) {
      if (Array.isArray(object.material)) {
        object.material.forEach(material => {
          if (material.map) material.map.dispose();
          if (material.lightMap) material.lightMap.dispose();
          if (material.aoMap) material.aoMap.dispose();
          if (material.emissiveMap) material.emissiveMap.dispose();
          if (material.bumpMap) material.bumpMap.dispose();
          if (material.normalMap) material.normalMap.dispose();
          if (material.roughnessMap) material.roughnessMap.dispose();
          if (material.metalnessMap) material.metalnessMap.dispose();
          if (material.alphaMap) material.alphaMap.dispose();
          material.dispose();
        });
      } else {
        if (object.material.map) object.material.map.dispose();
        if (object.material.lightMap) object.material.lightMap.dispose();
        if (object.material.aoMap) object.material.aoMap.dispose();
        if (object.material.emissiveMap) object.material.emissiveMap.dispose();
        if (object.material.bumpMap) object.material.bumpMap.dispose();
        if (object.material.normalMap) object.material.normalMap.dispose();
        if (object.material.roughnessMap) object.material.roughnessMap.dispose();
        if (object.material.metalnessMap) object.material.metalnessMap.dispose();
        if (object.material.alphaMap) object.material.alphaMap.dispose();
        object.material.dispose();
      }
    }
  }

  if (object.isLight) {
    // Lights have nothing to dispose
    return;
  }

  object.traverse((child) => {
    if (!object.isScene) {
      disposeObject(child);
    }
  });
}

function ErrorBoundary({ fallback, children }) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    return () => {
      setHasError(false);
    };
  }, []);

  if (hasError) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

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
  const { accentColor } = useThemeStore();
  return (
    <group>
      <mesh ref={meshRef}>
        <torusKnotGeometry args={[1, 0.35, 256, 64]} />
        <meshStandardMaterial color={accentColor} roughness={0.3} metalness={0.7} wireframe={wireframe} envMapIntensity={1.5} />
      </mesh>
    </group>
  );
}

function PlaceholderModel({ wireframe }: { wireframe: boolean }) {
  const { accentColor } = useThemeStore();
  return (
    <Float speed={1.5} rotationIntensity={0.3} floatIntensity={0.5}>
      <group>
        <Octahedron args={[1.2, 0]}>
          <meshStandardMaterial color={accentColor} roughness={0.12} metalness={0.8} wireframe={wireframe} />
        </Octahedron>
      </group>
    </Float>
  );
}

function FbxModel({ url, wireframe }: { url: string; wireframe: boolean }) {
  const obj = useLoader(FBXLoader, url);
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
    }

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
  }, [wireframe, obj]);

  // Dispose of the previous scene when the component unmounts or before loading a new one
  useEffect(() => {
    return () => {
      if (groupRef.current) {
        disposeObject(groupRef.current);
      }
    };
  }, []);

  return <group ref={groupRef}><primitive object={obj} /></group>;
}

function ObjModel({ url, wireframe }: { url: string; wireframe: boolean }) {
  const obj = useLoader(OBJLoader, url);
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
    }

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
  }, [wireframe, obj]);

  // Dispose of the previous scene when the component unmounts or before loading a new one
  useEffect(() => {
    return () => {
      if (groupRef.current) {
        disposeObject(groupRef.current);
      }
    };
  }, []);

  return <group ref={groupRef}><primitive object={obj} /></group>;
}

function StlModel({ url, wireframe }: { url: string; wireframe: boolean }) {
  const geometry = useLoader(STLLoader, url);
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
    }

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
  }, [wireframe, geometry]);

  // Dispose of the previous scene when the component unmounts or before loading a new one
  useEffect(() => {
    return () => {
      if (groupRef.current) {
        disposeObject(groupRef.current);
      }
    };
  }, []);

  return (
    <group ref={groupRef}>
      <mesh geometry={geometry}>
        <meshStandardMaterial color="#cccccc" wireframe={wireframe} />
      </mesh>
    </group>
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
  const { accentColor } = useThemeStore();
  if (!visible) return null;
  return (
    <Grid position={[0, -1.8, 0]} args={[20, 20]} cellSize={0.5} cellThickness={0.5} cellColor={accentColor} sectionSize={2.5} sectionThickness={1} sectionColor={accentColor} fadeDistance={20} fadeStrength={1} infiniteGrid />
  );
}

export function ViewerScene() {
  const { viewer } = useUIStore();
  const { currentJob } = useGenerationStore();
  const loadedModelUrl = useViewerStore((s) => s.loadedModelUrl);
  const setLoadedModel = useViewerStore((s) => s.setLoadedModel);
  const hasModel = currentJob?.status === 'completed' && currentJob.result;
  const modelUrl = currentJob?.result?.downloadUrls?.glb || currentJob?.result?.modelUrl;

  const handleLoadGlb = useCallback((e: CustomEvent) => {
    const url: string = e.detail?.url;
    if (!url) return;
    setLoadedModel(url, e.detail?.name ?? null);
  }, [setLoadedModel]);

  useEffect(() => {
    window.addEventListener('load-glb-model', handleLoadGlb as EventListener);
    return () => { window.removeEventListener('load-glb-model', handleLoadGlb as EventListener); };
  }, [handleLoadGlb]);

  // Helper to get file extension in lowercase without dot
  const getFileExtension = (url: string): string => {
    if (!url) return '';
    const match = url.match(/\.([^.]+)$/);
    return match ? match[1].toLowerCase() : '';
  };

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
          color={useThemeStore.getState().accentColor}
        />

        <directionalLight
          position={[0, 5, 8]}
          intensity={1.2}
          color="hsl(var(--foreground))"
        />
      <ErrorBoundary fallback={null}>
        <Suspense fallback={null}>
          <Environment preset="studio" />
        </Suspense>
      </ErrorBoundary>
      <Center>
        {loadedModelUrl ? (
          <Suspense fallback={<LoadingScreen />}>
            <ErrorBoundary fallback={null}>
              {/* User uploads: use UserModel for GLB/GLTF, and specific loaders for other formats */}
              {getFileExtension(loadedModelUrl) === 'glb' || getFileExtension(loadedModelUrl) === 'gltf' ? (
                <UserModel url={loadedModelUrl} wireframe={viewer.showWireframe} />
              ) : getFileExtension(loadedModelUrl) === 'fbx' ? (
                <FbxModel url={loadedModelUrl} wireframe={viewer.showWireframe} />
              ) : getFileExtension(loadedModelUrl) === 'obj' ? (
                <ObjModel url={loadedModelUrl} wireframe={viewer.showWireframe} />
              ) : getFileExtension(loadedModelUrl) === 'stl' ? (
                <StlModel url={loadedModelUrl} wireframe={viewer.showWireframe} />
              ) : (
                // Unsupported format - fallback to placeholder
                <PlaceholderModel wireframe={viewer.showWireframe} />
              )}
            </ErrorBoundary>
          </Suspense>
        ) : hasModel && modelUrl ? (
          <Suspense fallback={<LoadingScreen />}>
            <ErrorBoundary fallback={null}>
              {/* Generated models: use GeneratedModel for GLB/GLTF, and specific loaders for other formats */}
              {getFileExtension(modelUrl) === 'glb' || getFileExtension(modelUrl) === 'gltf' ? (
                <GeneratedModel url={modelUrl} wireframe={viewer.showWireframe} />
              ) : getFileExtension(modelUrl) === 'fbx' ? (
                <FbxModel url={modelUrl} wireframe={viewer.showWireframe} />
              ) : getFileExtension(modelUrl) === 'obj' ? (
                <ObjModel url={modelUrl} wireframe={viewer.showWireframe} />
              ) : getFileExtension(modelUrl) === 'stl' ? (
                <StlModel url={modelUrl} wireframe={viewer.showWireframe} />
              ) : (
                // Unsupported format - fallback to demo
                <DemoModel wireframe={viewer.showWireframe} />
              )}
            </ErrorBoundary>
          </Suspense>
        ) : hasModel ? (
          <DemoModel wireframe={viewer.showWireframe} />
        ) : (
          <DemoModel wireframe={viewer.showWireframe} />
        )}
      </Center>
      <SceneGrid visible={viewer.showGrid} />
      <Preload all />
    </>
  );
}
