"use client";

import React, { useState, useEffect } from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Trash2, 
  RefreshCw, 
  Activity, 
  AlertTriangle,
  FolderTree,
  X
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FileTree, type FileTreeNode, RippleButton } from '@/components/animate-ui';

interface InstalledModel {
  id: string;
  name: string;
  version: string;
  category: string;
  size_mb: number;
  installed_at: string;
  status: 'active' | 'inactive' | 'error';
  capabilities: string[];
}

export function InstalledModelsTab() {
  const [models, setModels] = useState<InstalledModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [modelToUninstall, setModelToUninstall] = useState<InstalledModel | null>(null);

  useEffect(() => {
    fetchInstalledModels();
  }, []);

  const fetchInstalledModels = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/models/installed');
      const data = await res.json();
      if (data.success) {
        setModels(data.data.models);
      }
    } catch (error) {
      console.error('Failed to fetch models:', error);
    } finally {
      setLoading(false);
    }
  };

  const confirmUninstall = async () => {
    if (!modelToUninstall) return;
    const modelId = modelToUninstall.id;
    setModelToUninstall(null);
    try {
      const res = await fetch(`/api/v1/models/${modelId}`, { method: 'DELETE' });
      if (res.ok) {
        if (selectedModelId === modelId) setSelectedModelId(null);
        fetchInstalledModels();
      }
    } catch (err) {
      console.error('Failed to uninstall model:', err);
    }
  };

  const handleRepair = async (modelId: string) => {
    const res = await fetch(`/api/v1/models/${modelId}/repair`, { method: 'POST' });
    if (res.ok) {
      fetchInstalledModels();
    }
  };

  const filteredModels = models.filter(m =>
    m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedModel = models.find(m => m.id === selectedModelId);

  const getModelTreeData = (model: InstalledModel): FileTreeNode[] => [
    {
      id: `${model.id}-root`,
      name: `models/${model.id}`,
      type: 'folder',
      children: [
        {
          id: `${model.id}-checkpoints`,
          name: 'checkpoints',
          type: 'folder',
          children: [
            {
              id: `${model.id}-weights`,
              name: `${model.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_v${model.version}.safetensors`,
              type: 'file',
              size: `${(model.size_mb).toFixed(0)} MB`,
              status: 'active',
            },
          ],
        },
        {
          id: `${model.id}-config`,
          name: 'config.json',
          type: 'file',
          size: '1.4 KB',
        },
        {
          id: `${model.id}-tokenizer`,
          name: 'tokenizer_config.json',
          type: 'file',
          size: '840 B',
        },
      ],
    },
  ];

  if (loading) {
    return <div className="text-[hsl(var(--foreground))]/60">Loading installed models...</div>;
  }

  return (
    <div className="space-y-4">
      <Input
        placeholder="Search installed models..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="bg-[hsl(var(--surface-2))] border-[hsl(var(--border))]/[0.3]"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredModels.map(model => {
          const isSelected = selectedModelId === model.id;
          return (
            <Card
              key={model.id}
              className={`bg-[hsl(var(--surface-2))] border transition cursor-pointer p-4 ${
                isSelected 
                  ? 'border-[#F9CF00]/60 ring-1 ring-[#F9CF00]/30 shadow-lg shadow-black/40' 
                  : 'border-[hsl(var(--border))]/[0.3] hover:border-white/[0.15]'
              }`}
              onClick={() => setSelectedModelId(isSelected ? null : model.id)}
            >
              <div className="space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-[hsl(var(--foreground))]">{model.name}</h3>
                    <p className="text-sm text-[hsl(var(--foreground))]/60">{model.id}</p>
                  </div>
                  <div className={`px-2 py-1 rounded text-xs font-medium ${
                    model.status === 'active' ? 'bg-green-900/30 text-[hsl(var(--neon-green))]' :
                    model.status === 'error' ? 'bg-red-900/30 text-[hsl(var(--destructive))]' :
                    'bg-yellow-900/30 text-[hsl(var(--neon-amber))]'
                  }`}>
                    <div className="flex gap-1 items-center">
                      <Activity className="w-3 h-3" />
                      {model.status}
                    </div>
                  </div>
                </div>

                <div className="text-sm text-[hsl(var(--foreground))]/60">
                  <p>Version: {model.version}</p>
                  <p>Size: {(model.size_mb / 1024).toFixed(1)} GB</p>
                  <p>Installed: {new Date(model.installed_at).toLocaleDateString()}</p>
                </div>

                {model.capabilities.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {model.capabilities.slice(0, 3).map(cap => (
                      <span key={cap} className="text-xs bg-[hsl(var(--surface-2))] text-[hsl(var(--foreground))]/80 px-2 py-1 rounded">
                        {cap}
                      </span>
                    ))}
                    {model.capabilities.length > 3 && (
                      <span className="text-xs bg-[hsl(var(--surface-2))] text-[hsl(var(--foreground))]/80 px-2 py-1 rounded">
                        +{model.capabilities.length - 3}
                      </span>
                    )}
                  </div>
                )}

                {model.status === 'error' && (
                  <div className="flex gap-1 text-[hsl(var(--neon-amber))] text-sm">
                    <AlertTriangle className="w-4 h-4 mt-0.5" />
                    <span>Health check failed</span>
                  </div>
                )}

                <div className="flex gap-2 pt-2 border-t border-[hsl(var(--border))]/[0.3]">
                  {model.status === 'error' && (
                    <RippleButton
                      size="sm"
                      variant="secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRepair(model.id);
                      }}
                      className="gap-1 flex-1 h-8 text-xs"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Repair
                    </RippleButton>
                  )}
                  <RippleButton
                    size="sm"
                    variant="destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      setModelToUninstall(model);
                    }}
                    className="gap-1 flex-1 h-8 text-xs bg-red-950/40 text-red-400 border border-red-900/40 hover:bg-red-900/30"
                  >
                    <Trash2 className="w-3 h-3" />
                    Uninstall
                  </RippleButton>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {filteredModels.length === 0 && (
        <div className="text-center text-[hsl(var(--foreground))]/60 py-8">
          No installed models found
        </div>
      )}

      {/* Model Asset Files Inspector */}
      {selectedModel && (
        <Card className="bg-[#14161A] border border-white/[0.08] p-4 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderTree className="w-4 h-4 text-[#F9CF00]" />
              <h4 className="text-sm font-medium text-white">
                File Structure & Checkpoints: <span className="text-zinc-400 font-normal">{selectedModel.name}</span>
              </h4>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-zinc-400 hover:text-white"
              onClick={() => setSelectedModelId(null)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div className="bg-[#0D0E10] p-3 rounded-lg border border-white/[0.04]">
            <FileTree data={getModelTreeData(selectedModel)} />
          </div>
        </Card>
      )}

      {/* Confirmation Alert Dialog */}
      <AlertDialog open={!!modelToUninstall} onOpenChange={(open) => { if (!open) setModelToUninstall(null); }}>
        <AlertDialogContent className="bg-[#14161A] border border-white/[0.08] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-semibold text-white">Uninstall Model</AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-zinc-400">
              Are you sure you want to uninstall <strong className="text-zinc-200">{modelToUninstall?.name}</strong>? All cached weights ({((modelToUninstall?.size_mb || 0) / 1024).toFixed(1)} GB) will be removed from local storage.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/[0.05] border-white/[0.08] text-zinc-300 hover:bg-white/[0.1] hover:text-white text-xs">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmUninstall}
              className="bg-red-600 text-white hover:bg-red-700 text-xs font-medium"
            >
              Uninstall
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
