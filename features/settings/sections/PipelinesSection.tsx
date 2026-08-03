"use client";

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/premium/Spinner';
import { adminService } from '@/services/adminService';
import type { PipelineSnapshot, PipelineStatus } from '@/types';
import { PipelinesDashboard } from './pipelines/PipelinesDashboard';

import { useUIStore } from '@/stores/useUIStore';
import { Switch } from '@/components/ui/switch';
import { useAutoSave } from '@/hooks/useAutoSave';

type BusyState = Record<string, boolean>;

export function PipelinesSection() {
  const [snapshot, setSnapshot] = useState<PipelineSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<BusyState>({});
  
  const { capabilities, setCapability } = useUIStore();

  const { Indicator } = useAutoSave(capabilities, async () => {
    // Already saved to local state synchronously, but showing the indicator for UX.
    await new Promise(r => setTimeout(r, 200));
  }, 500, true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminService.getPipelines();
      if (!data) {
        setSnapshot(null);
        setError('Unable to load pipeline status');
        return;
      }
      setSnapshot(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load pipeline status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setModelBusy = (id: string, value: boolean) => {
    setBusy((current) => ({ ...current, [id]: value }));
  };

  const handleToggle = async (model: PipelineStatus) => {
    if (!model.installed) {
      return null;
    }

    setModelBusy(model.id, true);
    try {
      const updated = await adminService.togglePipeline(model.id, !model.enabled);
      if (updated) {
        setSnapshot(updated);
        return updated;
      }
      await load();
      return null;
    } finally {
      setModelBusy(model.id, false);
    }
  };

  const handleInstall = async (model: PipelineStatus) => {
    setModelBusy(model.id, true);
    try {
      await adminService.modelAction(model.id, 'install');
      setTimeout(() => { void load(); }, 2000);
    } finally {
      setModelBusy(model.id, false);
    }
  };

  const handleUninstall = async (model: PipelineStatus) => {
    setModelBusy(model.id, true);
    try {
      await adminService.modelAction(model.id, 'uninstall');
      setTimeout(() => { void load(); }, 1500);
    } finally {
      setModelBusy(model.id, false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-destructive">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span className="flex-1">{error}</span>
          <Button variant="outline" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
          No pipeline snapshot available.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8">
      <Indicator />
      <div>
        <h2 className="text-xl font-semibold mb-4">Global AI Capabilities</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-card">
            <div>
              <p className="font-medium">3D Generation</p>
              <p className="text-sm text-muted-foreground">Enable 3D mesh generation capabilities</p>
            </div>
            <Switch
              checked={capabilities.threeDGen}
              onCheckedChange={(c) => setCapability('threeDGen', c)}
            />
          </div>
          
          <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-card">
            <div>
              <p className="font-medium">Remesh & Refine</p>
              <p className="text-sm text-muted-foreground">Enable mesh optimization and remeshing</p>
            </div>
            <Switch
              checked={capabilities.remesh}
              onCheckedChange={(c) => setCapability('remesh', c)}
            />
          </div>

          <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-card">
            <div>
              <p className="font-medium">Texture Generation</p>
              <p className="text-sm text-muted-foreground">Enable AI texture mapping for 3D objects</p>
            </div>
            <Switch
              checked={capabilities.textureGen}
              onCheckedChange={(c) => setCapability('textureGen', c)}
            />
          </div>

          <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-card">
            <div>
              <p className="font-medium">Segmentation (HoloPart)</p>
              <p className="text-sm text-muted-foreground">Enable AI part segmentation for 3D models</p>
            </div>
            <Switch
              checked={capabilities.segmentation}
              onCheckedChange={(c) => setCapability('segmentation', c)}
            />
          </div>

          <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-card">
            <div>
              <p className="font-medium">Rigging & Animation</p>
              <p className="text-sm text-muted-foreground">Enable auto-rigging and animation preview</p>
            </div>
            <Switch
              checked={capabilities.riggingAnimation}
              onCheckedChange={(c) => setCapability('riggingAnimation', c)}
            />
          </div>
        </div>
      </div>
      
      <div>
        <h2 className="text-xl font-semibold mb-4">Pipeline Status & Management</h2>
        <PipelinesDashboard
          snapshot={snapshot}
          busy={busy}
          onRefresh={load}
          onToggle={handleToggle}
          onInstall={handleInstall}
          onUninstall={handleUninstall}
        />
      </div>
    </div>
  );
}
