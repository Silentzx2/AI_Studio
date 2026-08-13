"use client";

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * New 3D Generation page — wires the three 3D-SPACE building blocks
 * (GenerationControls, Canvas3D, AssetPanel) into a single workspace.
 *
 * Data flow:
 *  - GenerationControls drives the real generation pipeline via useGeneration +
 *    useGenerationStore (mode, prompt, model, quality, image upload, etc.).
 *  - Canvas3D renders the live/completed model straight from useGenerationStore
 *    (currentJob.result) and also reacts to `load-glb-model` events dispatched
 *    when an asset is selected in the panel.
 *  - AssetPanel is fed real history from useGenerationStore.jobHistory
 *    (loaded from /api/v1/generation/history), with selection → canvas and
 *    delete → backend.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import GenerationControls from "@/3D-SPACE/GenerationControls";
import Canvas3D from "@/3D-SPACE/Canvas3D";
import AssetPanel, { type AssetItem } from "@/3D-SPACE/AssetPanel";
import { WorkspaceNavbar } from "./WorkspaceNavbar";
import { useGenerationStore } from "@/stores/useGenerationStore";
import { useGeneration } from "@/hooks/useGeneration";
import { toast } from "sonner";

function jobToAsset(job: any): AssetItem {
  const prompt: string = job?.prompt || job?.config?.prompt || "Untitled";
  const result = job?.result || {};
  return {
    id: job.id,
    name: prompt.split(" ").slice(0, 4).join(" ") || "Untitled Asset",
    prompt,
    format: job?.format || "GLB",
    timestamp: new Date(job?.created_at || job?.createdAt || 0).toLocaleDateString(),
    thumbnailUrl: job?.thumbnail_url || result?.thumbnailUrl || result?.thumbnail_url || null,
    modelUrl: job?.model_url || result?.modelUrl || result?.model_url || null,
    isFavorite: !!(job?.is_favorite || job?.isFavorite),
    job,
  };
}

export function ThreeDGenWorkspace() {
  const { jobHistory, isLoadingHistory, loadHistory } = useGenerationStore();
  const { isGenerating, currentJob } = useGeneration();

  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const prevStatusRef = useRef<string | null>(null);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Refresh the asset list once a generation finishes so the new model shows up.
  useEffect(() => {
    const status = currentJob?.status ?? null;
    if (prevStatusRef.current && prevStatusRef.current !== "completed" && status === "completed") {
      loadHistory();
    }
    prevStatusRef.current = status;
  }, [currentJob?.status, loadHistory]);

  const assets = useMemo<AssetItem[]>(
    () =>
      (jobHistory ?? []).map(jobToAsset).map((a) =>
        favorites.has(a.id) ? { ...a, isFavorite: true } : a
      ),
    [jobHistory, favorites]
  );

  const handleSelectAsset = (asset: AssetItem) => {
    setSelectedAssetId(asset.id);
    if (asset.modelUrl) {
      window.dispatchEvent(new CustomEvent("load-glb-model", { detail: { url: asset.modelUrl } }));
    }
  };

  const handleToggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeleteAsset = async (id: string) => {
    try {
      await fetch(`/api/v1/jobs/${id}`, { method: "DELETE" });
      setSelectedAssetId((prev) => (prev === id ? null : prev));
      toast.success("Asset deleted");
      loadHistory();
    } catch {
      toast.error("Failed to delete asset");
    }
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[hsl(var(--surface-0))]">
      <WorkspaceNavbar />
      <div className="flex flex-1 min-h-0">
        <div className="w-[340px] max-w-[85vw] shrink-0">
          <GenerationControls />
        </div>
        <div className="flex-1 min-w-0 min-h-0">
          <Canvas3D isGenerating={isGenerating} />
        </div>
        <div className="w-[320px] max-w-[85vw] shrink-0">
          <AssetPanel
            assets={assets}
            selectedAssetId={selectedAssetId}
            onSelectAsset={handleSelectAsset}
            onToggleFavorite={handleToggleFavorite}
            onDeleteAsset={handleDeleteAsset}
            loading={isLoadingHistory}
          />
        </div>
      </div>
    </div>
  );
}
