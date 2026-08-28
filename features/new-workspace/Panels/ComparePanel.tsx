import React, { useState, useCallback, useMemo } from 'react';
import {
  ArrowLeftRight,
  Link2,
  Link2Off,
  Grid3x3,
  Box,
  Eye,
  ChevronDown,
  Layers,
  Triangle,
  HardDrive,
  ArrowRightLeft,
} from 'lucide-react';
import * as THREE from 'three';
import { useWorkspace } from '../store/WorkspaceContext';
import { CompareViewport } from '../Viewport/CompareViewport';
import { ShadingMode, ModelAsset } from '../types';

interface PropertyDiff {
  label: string;
  leftValue: string;
  rightValue: string;
  diff?: 'higher' | 'lower' | 'equal' | 'none';
  diffText?: string;
}

export const ComparePanel: React.FC = () => {
  const {
    assets,
    currentAsset,
    shadingMode,
    setShadingMode,
    showGrid,
    setShowGrid,
    showWireframe,
    setShowWireframe,
  } = useWorkspace();

  const [leftAssetId, setLeftAssetId] = useState<string | null>(currentAsset?.id || assets[0]?.id || null);
  const [rightAssetId, setRightAssetId] = useState<string | null>(assets[1]?.id || null);
  const [syncCamera, setSyncCamera] = useState(false);
  const [cameraState, setCameraState] = useState<{ position: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  const [leftDropdownOpen, setLeftDropdownOpen] = useState(false);
  const [rightDropdownOpen, setRightDropdownOpen] = useState(false);

  const leftAsset = useMemo(
    () => assets.find(a => a.id === leftAssetId) || null,
    [assets, leftAssetId]
  );

  const rightAsset = useMemo(
    () => assets.find(a => a.id === rightAssetId) || null,
    [assets, rightAssetId]
  );

  const handleSwap = useCallback(() => {
    const tempId = leftAssetId;
    setLeftAssetId(rightAssetId);
    setRightAssetId(tempId);
  }, [leftAssetId, rightAssetId]);

  const handleCameraChange = useCallback((side: 'left' | 'right') => {
    return (state: { position: THREE.Vector3; target: THREE.Vector3 }) => {
      if (syncCamera) {
        setCameraState({ position: state.position.clone(), target: state.target.clone() });
      }
    };
  }, [syncCamera]);

  // Compute property differences
  const propertyDiffs = useMemo((): PropertyDiff[] => {
    const formatNum = (n: number) => n > 0 ? n.toLocaleString() : '—';
    const formatSize = (asset: ModelAsset | null) => {
      if (!asset?.source?.filename) return '—';
      return asset.source.filename.split('.').pop()?.toUpperCase() || '—';
    };

    const faceDiff = (): PropertyDiff['diff'] => {
      if (!leftAsset?.statsAvailable || !rightAsset?.statsAvailable) return 'none';
      if (leftAsset.faces > rightAsset.faces) return 'higher';
      if (leftAsset.faces < rightAsset.faces) return 'lower';
      return 'equal';
    };

    const vertexDiff = (): PropertyDiff['diff'] => {
      if (!leftAsset?.statsAvailable || !rightAsset?.statsAvailable) return 'none';
      if (leftAsset.vertices > rightAsset.vertices) return 'higher';
      if (leftAsset.vertices < rightAsset.vertices) return 'lower';
      return 'equal';
    };

    const triangleDiff = (): PropertyDiff['diff'] => {
      if (!leftAsset?.statsAvailable || !rightAsset?.statsAvailable) return 'none';
      if (leftAsset.triangles > rightAsset.triangles) return 'higher';
      if (leftAsset.triangles < rightAsset.triangles) return 'lower';
      return 'equal';
    };

    const getDiffText = (diff: PropertyDiff['diff'], leftVal: number, rightVal: number): string | undefined => {
      if (diff === 'none' || diff === 'equal') return diff === 'equal' ? 'Same' : undefined;
      if (rightVal === 0 || leftVal === 0) return undefined;
      const ratio = diff === 'higher' ? leftVal / rightVal : rightVal / leftVal;
      if (ratio >= 1.5) return `${ratio.toFixed(1)}x more`;
      return ratio > 1 ? `${((ratio - 1) * 100).toFixed(0)}% more` : undefined;
    };

    const fd = faceDiff();
    const vd = vertexDiff();
    const td = triangleDiff();

    return [
      {
        label: 'Format',
        leftValue: formatSize(leftAsset),
        rightValue: formatSize(rightAsset),
        diff: 'none' as const,
      },
      {
        label: 'Topology',
        leftValue: leftAsset?.topology || '—',
        rightValue: rightAsset?.topology || '—',
        diff: 'none' as const,
      },
      {
        label: 'Faces',
        leftValue: formatNum(leftAsset?.faces || 0),
        rightValue: formatNum(rightAsset?.faces || 0),
        diff: fd,
        diffText: getDiffText(fd, leftAsset?.faces || 0, rightAsset?.faces || 0),
      },
      {
        label: 'Vertices',
        leftValue: formatNum(leftAsset?.vertices || 0),
        rightValue: formatNum(rightAsset?.vertices || 0),
        diff: vd,
        diffText: getDiffText(vd, leftAsset?.vertices || 0, rightAsset?.vertices || 0),
      },
      {
        label: 'Triangles',
        leftValue: formatNum(leftAsset?.triangles || 0),
        rightValue: formatNum(rightAsset?.triangles || 0),
        diff: td,
        diffText: getDiffText(td, leftAsset?.triangles || 0, rightAsset?.triangles || 0),
      },
    ];
  }, [leftAsset, rightAsset]);

  const shadingModes: { mode: ShadingMode; label: string; icon: React.ReactNode }[] = [
    { mode: 'textured', label: 'Textured', icon: <Eye className="w-3 h-3" /> },
    { mode: 'clay', label: 'Clay', icon: <Box className="w-3 h-3" /> },
    { mode: 'wireframe', label: 'Wireframe', icon: <Grid3x3 className="w-3 h-3" /> },
    { mode: 'matcap-chrome', label: 'Chrome', icon: <Layers className="w-3 h-3" /> },
    { mode: 'matcap-gold', label: 'Gold', icon: <Triangle className="w-3 h-3" /> },
    { mode: 'xray', label: 'X-Ray', icon: <HardDrive className="w-3 h-3" /> },
  ];

  return (
    <div className="flex flex-col h-full bg-[#101115] text-xs select-none">
      {/* Header */}
      <div className="p-3.5 pb-2 border-b border-[#21242c]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-[#f5c518]" />
            <h2 className="text-sm font-bold text-[#f3f4f6]">Compare Models</h2>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#1c202a] text-[#f5c518] border border-[#f5c518]/20">
            Side-by-Side
          </span>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="px-3.5 py-2.5 border-b border-[#21242c] flex items-center gap-2 flex-wrap">
        {/* Sync Camera Toggle */}
        <button
          onClick={() => setSyncCamera(!syncCamera)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
            syncCamera
              ? 'bg-[#f5c518]/15 text-[#f5c518] border border-[#f5c518]/50'
              : 'bg-[#181a22] text-[#8e95a5] border border-[#262a36] hover:text-[#f3f4f6]'
          }`}
          title={syncCamera ? 'Unlink cameras' : 'Sync cameras'}
        >
          {syncCamera ? <Link2 className="w-3.5 h-3.5" /> : <Link2Off className="w-3.5 h-3.5" />}
          <span>{syncCamera ? 'Synced' : 'Sync Cam'}</span>
        </button>

        {/* Grid Toggle */}
        <button
          onClick={() => setShowGrid(!showGrid)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
            showGrid
              ? 'bg-[#f5c518]/15 text-[#f5c518] border border-[#f5c518]/50'
              : 'bg-[#181a22] text-[#8e95a5] border border-[#262a36] hover:text-[#f3f4f6]'
          }`}
        >
          <Grid3x3 className="w-3.5 h-3.5" />
          <span>Grid</span>
        </button>

        {/* Wireframe Toggle */}
        <button
          onClick={() => setShowWireframe(!showWireframe)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
            showWireframe
              ? 'bg-[#f5c518]/15 text-[#f5c518] border border-[#f5c518]/50'
              : 'bg-[#181a22] text-[#8e95a5] border border-[#262a36] hover:text-[#f3f4f6]'
          }`}
        >
          <Box className="w-3.5 h-3.5" />
          <span>Wire</span>
        </button>

        {/* Shading Mode Selector */}
        <div className="relative">
          <button
            onClick={() => {
              // Cycle through shading modes
              const currentIndex = shadingModes.findIndex(m => m.mode === shadingMode);
              const nextIndex = (currentIndex + 1) % shadingModes.length;
              setShadingMode(shadingModes[nextIndex].mode);
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-[#181a22] text-[#8e95a5] border border-[#262a36] hover:text-[#f3f4f6] transition-all"
          >
            {shadingModes.find(m => m.mode === shadingMode)?.icon || <Eye className="w-3.5 h-3.5" />}
            <span>{shadingModes.find(m => m.mode === shadingMode)?.label || 'Shading'}</span>
            <ChevronDown className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Viewports Container */}
      <div className="flex-1 p-3.5 overflow-hidden">
        <div className="flex h-full gap-3">
          {/* Left Viewport */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Asset Selector */}
            <div className="relative mb-2">
              <button
                onClick={() => setLeftDropdownOpen(!leftDropdownOpen)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-[#14161c] border border-[#232731] text-[11px] font-medium text-[#e5e7eb] hover:border-[#f5c518]/40 transition-colors"
              >
                <span className="truncate">{leftAsset?.name || 'Select Model A'}</span>
                <ChevronDown className="w-3.5 h-3.5 text-[#6b7280] flex-shrink-0 ml-2" />
              </button>
              {leftDropdownOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-lg bg-[#1a1d26] border border-[#2e3342] shadow-xl z-50">
                  {assets.map(asset => (
                    <button
                      key={asset.id}
                      onClick={() => { setLeftAssetId(asset.id); setLeftDropdownOpen(false); }}
                      className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-[#252a36] transition-colors ${
                        leftAssetId === asset.id ? 'text-[#f5c518] font-bold' : 'text-[#cbd5e1]'
                      }`}
                    >
                      {asset.name}
                    </button>
                  ))}
                  {assets.length === 0 && (
                    <div className="px-3 py-2 text-[10px] text-[#6b7280]">No assets available</div>
                  )}
                </div>
              )}
            </div>
            {/* Viewport */}
            <div className="flex-1 min-h-0">
              <CompareViewport
                asset={leftAsset}
                shadingMode={shadingMode}
                showWireframe={showWireframe}
                showGrid={showGrid}
                syncCamera={syncCamera}
                externalCameraState={syncCamera && rightAssetId ? cameraState : null}
                onCameraChange={handleCameraChange('left')}
                label="A"
              />
            </div>
          </div>

          {/* Swap Button (Center) */}
          <div className="flex items-center">
            <button
              onClick={handleSwap}
              className="w-9 h-9 rounded-xl bg-[#1c1f28] border border-[#2e3342] flex items-center justify-center text-[#8e95a5] hover:text-[#f5c518] hover:border-[#f5c518]/50 transition-all active:scale-95"
              title="Swap models"
            >
              <ArrowLeftRight className="w-4 h-4" />
            </button>
          </div>

          {/* Right Viewport */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Asset Selector */}
            <div className="relative mb-2">
              <button
                onClick={() => setRightDropdownOpen(!rightDropdownOpen)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-[#14161c] border border-[#232731] text-[11px] font-medium text-[#e5e7eb] hover:border-[#f5c518]/40 transition-colors"
              >
                <span className="truncate">{rightAsset?.name || 'Select Model B'}</span>
                <ChevronDown className="w-3.5 h-3.5 text-[#6b7280] flex-shrink-0 ml-2" />
              </button>
              {rightDropdownOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-lg bg-[#1a1d26] border border-[#2e3342] shadow-xl z-50">
                  {assets.map(asset => (
                    <button
                      key={asset.id}
                      onClick={() => { setRightAssetId(asset.id); setRightDropdownOpen(false); }}
                      className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-[#252a36] transition-colors ${
                        rightAssetId === asset.id ? 'text-[#f5c518] font-bold' : 'text-[#cbd5e1]'
                      }`}
                    >
                      {asset.name}
                    </button>
                  ))}
                  {assets.length === 0 && (
                    <div className="px-3 py-2 text-[10px] text-[#6b7280]">No assets available</div>
                  )}
                </div>
              )}
            </div>
            {/* Viewport */}
            <div className="flex-1 min-h-0">
              <CompareViewport
                asset={rightAsset}
                shadingMode={shadingMode}
                showWireframe={showWireframe}
                showGrid={showGrid}
                syncCamera={syncCamera}
                externalCameraState={syncCamera && leftAssetId ? cameraState : null}
                onCameraChange={handleCameraChange('right')}
                label="B"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Properties Comparison Table */}
      <div className="border-t border-[#21242c] px-3.5 py-3">
        <div className="flex items-center gap-2 mb-2">
          <Layers className="w-3.5 h-3.5 text-[#f5c518]" />
          <span className="text-[11px] font-bold text-[#f3f4f6]">Properties Comparison</span>
        </div>
        <div className="space-y-1">
          {propertyDiffs.map((prop) => (
            <div key={prop.label} className="flex items-center justify-between text-[10px] py-1 px-2 rounded-lg bg-[#14161c] border border-[#1e222c]">
              <span className="text-[#8e95a5] font-medium w-16">{prop.label}</span>
              <div className="flex items-center gap-2 flex-1 justify-end">
                <span className={`font-mono ${prop.diff === 'higher' ? 'text-[#22c55e]' : prop.diff === 'lower' ? 'text-[#ef4444]' : 'text-[#cbd5e1]'}`}>
                  {prop.leftValue}
                </span>
                <span className="text-[#4b5563]">vs</span>
                <span className={`font-mono ${prop.diff === 'lower' ? 'text-[#22c55e]' : prop.diff === 'higher' ? 'text-[#ef4444]' : 'text-[#cbd5e1]'}`}>
                  {prop.rightValue}
                </span>
                {prop.diffText && (
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                    prop.diff === 'higher' || prop.diff === 'lower'
                      ? 'bg-[#f5c518]/15 text-[#f5c518]'
                      : 'bg-[#22c55e]/15 text-[#22c55e]'
                  }`}>
                    {prop.diffText}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
