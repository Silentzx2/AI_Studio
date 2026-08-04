"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Bell,
  Box,
  ChevronDown,
  ChevronRight,
  Check,
  CheckCircle,
  Cpu,
  Download,
  Filter,
  Flame,
  Layers3,
  LayoutGrid,
  Loader2,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  Save,  Search,
  Sparkles,
  Star,
  Trash2,
  TrendingUp,
  Wand2,
  X,
  XCircle,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { PipelineSnapshot, PipelineStatus } from '@/types';

type BusyState = Record<string, boolean>;
type TabKey = 'overview' | 'compare' | 'performance' | 'chaining' | 'presets';

type NotificationKind = 'info' | 'success' | 'warning' | 'error';

interface NotificationItem {
  id: string;
  kind: NotificationKind;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
}

interface WorkflowPreset {
  id: string;
  name: string;
  description: string;
  source: 'system' | 'custom';
  inputMode: 'image' | 'text' | 'mesh';
  chain: string[];
  texture: boolean;
  rigging: boolean;
  detail: boolean;
  outputFormat: 'glb' | 'fbx' | 'usdz' | 'obj';
  estimatedSeconds: number;
  minVramMb: number;
  usageCount: number;
  createdAt: string;
}

interface ModelReference {
  label: string;
  summary: string;
  diskSpaceMb: number;
  quality: number;
  recommendation: 'fast' | 'quality' | 'professional' | 'balanced';
  bestFor: string[];
  workflow: string;
  notes: string;
}

interface DisplayPipeline extends PipelineStatus {
  summary: string;
  diskSpaceMb: number;
  quality: number;
  recommendation: ModelReference['recommendation'];
  bestFor: string[];
  workflow: string;
  notesText: string;
}

const STORAGE_KEYS = {
  notifications: 'ai3d:pipelines:notifications:v1',
  workflows: 'ai3d:pipelines:workflows:v1',
  presets: 'ai3d:pipelines:presets:v1',
  compare: 'ai3d:pipelines:compare:v1',
} as const;

const MODEL_LIBRARY: Record<string, ModelReference> = {
  triposr: {
    label: 'TripoSR',
    summary: 'Fast preview-grade image-to-3D reconstruction.',
    diskSpaceMb: 450,
    quality: 3,
    recommendation: 'fast',
    bestFor: ['Quick preview', 'Iteration', 'Small VRAM'],
    workflow: 'Direct mesh output',
    notes: 'Texture baking is optional via the model flag.',
  },
  triposg: {
    label: 'TripoSG',
    summary: 'High-fidelity shape synthesis with sharper geometry.',
    diskSpaceMb: 2300,
    quality: 4,
    recommendation: 'quality',
    bestFor: ['Fine detail', 'Complex shapes', 'Polish passes'],
    workflow: 'Generate then enhance',
    notes: 'Geometry-first pipeline; pair with rigging if needed.',
  },
  triposf: {
    label: 'TripoSF',
    summary: 'High-resolution sparse-flex reconstruction.',
    diskSpaceMb: 4100,
    quality: 5,
    recommendation: 'professional',
    bestFor: ['Open surfaces', 'Rich topology', 'High detail'],
    workflow: 'High-res mesh build',
    notes: 'Best when detail matters more than speed.',
  },
  trellis: {
    label: 'Trellis',
    summary: 'Balanced text/image-to-3D generation with texture support.',
    diskSpaceMb: 10000,
    quality: 4,
    recommendation: 'balanced',
    bestFor: ['Text prompts', 'Textured assets', 'Multi-purpose'],
    workflow: 'Prompt or image to textured mesh',
    notes: 'Good all-rounder when you need text-to-3D too.',
  },
  'hunyuan3d-2.1': {
    label: 'Hunyuan3D-2.1',
    summary: 'Complete image/text-to-3D with built-in texture support.',
    diskSpaceMb: 20000,
    quality: 5,
    recommendation: 'professional',
    bestFor: ['Text-to-3D', 'PBR textures', 'Complete assets'],
    workflow: 'Mesh then texture in one pipeline',
    notes: 'Can unlock both image and text input modes.',
  },
  'hunyuan3d-2': {
    label: 'Hunyuan3D-2',
    summary: 'Full Hunyuan 3D pipeline with textured output.',
    diskSpaceMb: 20000,
    quality: 5,
    recommendation: 'professional',
    bestFor: ['Text-to-3D', 'PBR textures', 'Complete assets'],
    workflow: 'Mesh then texture in one pipeline',
    notes: 'Alias of the current Hunyuan 3D runtime family.',
  },
  unirig: {
    label: 'UniRig',
    summary: 'Automatic skeletal rigging and animation prep.',
    diskSpaceMb: 3000,
    quality: 4,
    recommendation: 'balanced',
    bestFor: ['Skeletons', 'Animation-ready exports', 'Post-process'],
    workflow: 'Rig after generation',
    notes: 'Best chained after a mesh-producing model.',
  },
  holopart: {
    label: 'HoloPart',
    summary: 'Part completion and semantic mesh enhancement.',
    diskSpaceMb: 5000,
    quality: 4,
    recommendation: 'balanced',
    bestFor: ['Part completion', 'Editing', 'Enhancement'],
    workflow: 'Post-process mesh parts',
    notes: 'Useful when geometry needs cleanup or completion.',
  },
};

const DEFAULT_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'notice-ready',
    kind: 'info',
    title: 'Pipelines page loaded',
    message: 'Model registry snapshot is ready for comparison and workflow planning.',
    createdAt: new Date().toISOString(),
    read: false,
  },
];

const DEFAULT_WORKFLOWS: WorkflowPreset[] = [
  {
    id: 'preview',
    name: 'Preview Workflow',
    description: 'Fast image-to-3D preview path.',
    source: 'system',
    inputMode: 'image',
    chain: ['triposr'],
    texture: false,
    rigging: false,
    detail: false,
    outputFormat: 'glb',
    estimatedSeconds: 1,
    minVramMb: 6000,
    usageCount: 0,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'standard',
    name: 'Standard Workflow',
    description: 'Quality mesh with optional rigging.',
    source: 'system',
    inputMode: 'image',
    chain: ['triposg', 'unirig'],
    texture: false,
    rigging: true,
    detail: true,
    outputFormat: 'glb',
    estimatedSeconds: 75,
    minVramMb: 12000,
    usageCount: 0,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'pro',
    name: 'Professional Workflow',
    description: 'Complete asset with texture and rigging.',
    source: 'system',
    inputMode: 'text',
    chain: ['hunyuan3d-2.1', 'unirig'],
    texture: true,
    rigging: true,
    detail: true,
    outputFormat: 'glb',
    estimatedSeconds: 165,
    minVramMb: 20000,
    usageCount: 0,
    createdAt: new Date().toISOString(),
  },
];

function storageRead<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function storageWrite<T>(key: string, value: T) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function starRating(value: number) {
  return (
    <span className="inline-flex items-center gap-0.5 text-[hsl(var(--neon-amber))]">
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${i < value ? 'fill-current' : 'opacity-30'}`}
        />
      ))}
    </span>
  );
}

function formatSeconds(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '—';
  return value < 1 ? '<1s' : `~${value}s`;
}

function formatGigabytes(valueMb: number) {
  if (!Number.isFinite(valueMb) || valueMb <= 0) return '—';
  if (valueMb < 1024) return `${Math.round(valueMb)}MB`;
  const gb = valueMb / 1024;
  return gb >= 10 ? `${Math.round(gb)}GB` : `${gb.toFixed(1)}GB`;
}

function progressValue(value: number, max: number) {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.max(0, Math.min(100, (value / max) * 100));
}

function orderForRecommendation(kind: ModelReference['recommendation']) {
  switch (kind) {
    case 'fast':
      return 0;
    case 'quality':
      return 1;
    case 'balanced':
      return 2;
    default:
      return 3;
  }
}

function collectCapabilities(model: DisplayPipeline) {
  const caps = model.supports;
  return [
    { label: 'Image-to-3D', active: caps.image_to_3d },
    { label: 'Text-to-3D', active: caps.text_to_3d },
    { label: 'Texture', active: caps.texture_generation },
    { label: 'Rigging', active: caps.rigging_animation },
    { label: 'Detail', active: caps.detail_enhancement },
  ];
}

function featureSummary(features: PipelineSnapshot['computed_features']) {
  return Object.values(features).filter(Boolean).length;
}

function estimateQuality(model: DisplayPipeline) {
  let score = model.quality;
  if (model.supports.texture_generation) score += 0.4;
  if (model.supports.rigging_animation) score += 0.2;
  if (model.supports.text_to_3d) score += 0.2;
  return Math.min(5, Math.round(score * 10) / 10);
}

function computeWorkflowTime(chain: string[], texture: boolean, rigging: boolean, detail: boolean) {
  const modelTime = chain.reduce((sum, id) => sum + (MODEL_LIBRARY[id]?.recommendation === 'fast' ? 1 : MODEL_LIBRARY[id]?.recommendation === 'quality' ? 45 : MODEL_LIBRARY[id]?.recommendation === 'balanced' ? 60 : 90), 0);
  const extras = (texture ? 20 : 0) + (rigging ? 30 : 0) + (detail ? 10 : 0);
  return modelTime + extras;
}

function computeWorkflowVram(chain: string[]) {
  const modelVram = chain.reduce((max, id) => {
    const model = MODEL_LIBRARY[id];
    if (!model) return max;
    const vramById: Record<string, number> = {
      triposr: 6000,
      triposg: 12000,
      triposf: 12000,
      trellis: 12000,
      'hunyuan3d-2.1': 20000,
      'hunyuan3d-2': 20000,
      unirig: 8000,
      holopart: 8000,
    };
    return Math.max(max, vramById[id] ?? 0);
  }, 0);
  return modelVram;
}

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

interface PipelinesDashboardProps {
  snapshot: PipelineSnapshot;
  busy: BusyState;
  onRefresh: () => Promise<void>;
  onToggle: (model: PipelineStatus) => Promise<PipelineSnapshot | null>;
  onInstall: (model: PipelineStatus) => Promise<void>;
  onUninstall: (model: PipelineStatus) => Promise<void>;
}

function generateUniqueId() {
  return `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function PipelinesDashboard({
  snapshot,
  busy,
  onRefresh,
  onToggle,
  onInstall,
  onUninstall,
}: PipelinesDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [notifications, setNotifications] = useState<NotificationItem[]>(DEFAULT_NOTIFICATIONS);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [selectedCompareIds, setSelectedCompareIds] = useState<string[]>([]);
  const [compareSort, setCompareSort] = useState<'default' | 'speed' | 'quality' | 'vram'>('default');
  const [workflowName, setWorkflowName] = useState('');
  const [workflowDescription, setWorkflowDescription] = useState('');
  const [workflowInput, setWorkflowInput] = useState<'image' | 'text' | 'mesh'>('image');
  const [workflowChain, setWorkflowChain] = useState<string[]>([]);
  const [workflowTexture, setWorkflowTexture] = useState(false);
  const [workflowRigging, setWorkflowRigging] = useState(false);
  const [workflowDetail, setWorkflowDetail] = useState(true);
  const [workflowOutput, setWorkflowOutput] = useState<'glb' | 'fbx' | 'usdz' | 'obj'>('glb');
  const [userWorkflows, setUserWorkflows] = useState<WorkflowPreset[]>([]);
  const [userPresets, setUserPresets] = useState<WorkflowPreset[]>([]);
  const [searchPreset, setSearchPreset] = useState('');
  const [presetFilter, setPresetFilter] = useState<'all' | 'system' | 'custom'>('all');

  const displayModels: DisplayPipeline[] = useMemo(() => {
    return snapshot.pipelines.map((pipeline) => {
      const reference = MODEL_LIBRARY[pipeline.id] ?? {
        label: pipeline.label,
        summary: pipeline.category,
        diskSpaceMb: Math.max(1000, Math.round(pipeline.vram_required_mb * 1.3)),
        quality: pipeline.supports.detail_enhancement || pipeline.supports.texture_generation ? 4 : 3,
        recommendation: pipeline.supports.text_to_3d ? 'professional' : pipeline.supports.texture_generation ? 'balanced' : 'fast',
        bestFor: [pipeline.category],
        workflow: pipeline.supports.rigging_animation ? 'Generate then rig' : 'Generate and export',
        notes: pipeline.notes?.[0] ?? '',
      };

      return {
        ...pipeline,
        summary: reference.summary,
        diskSpaceMb: reference.diskSpaceMb,
        quality: reference.quality,
        recommendation: reference.recommendation,
        bestFor: reference.bestFor,
        workflow: reference.workflow,
        notesText: reference.notes,
      };
    }).sort((a, b) => {
      const aInstalled = a.installed ? 0 : 1;
      const bInstalled = b.installed ? 0 : 1;
      if (aInstalled !== bInstalled) return aInstalled - bInstalled;
      return a.label.localeCompare(b.label);
    });
  }, [snapshot.pipelines]);

  const installedCount = displayModels.filter((model) => model.installed).length;
  const enabledCount = displayModels.filter((model) => model.installed && model.enabled).length;
  const readyCount = displayModels.filter((model) => model.status === 'ready').length;
  const maxVram = Math.max(...displayModels.map((model) => model.vram_required_mb), 0);
  const avgSpeed = displayModels.length
    ? Math.round(displayModels.reduce((sum, model) => sum + model.speed_seconds, 0) / displayModels.length)
    : 0;

  useEffect(() => {
    const storedCompare = storageRead<string[]>(STORAGE_KEYS.compare, []);
    const compareIds = storedCompare.filter((id) => displayModels.some((model) => model.id === id));
    setSelectedCompareIds(compareIds.length >= 2 ? compareIds.slice(0, 4) : displayModels.slice(0, Math.min(4, displayModels.length)).map((model) => model.id));

    setNotifications((current) => {
      const stored = storageRead<NotificationItem[]>(STORAGE_KEYS.notifications, []);
      const next = stored.length ? stored : current;
      return next.length ? next : DEFAULT_NOTIFICATIONS;
    });

    setUserWorkflows(storageRead<WorkflowPreset[]>(STORAGE_KEYS.workflows, []));
    setUserPresets(storageRead<WorkflowPreset[]>(STORAGE_KEYS.presets, []));
  }, [displayModels]);

  useEffect(() => {
    storageWrite(STORAGE_KEYS.notifications, notifications);
  }, [notifications]);

  useEffect(() => {
    storageWrite(STORAGE_KEYS.workflows, userWorkflows);
  }, [userWorkflows]);

  useEffect(() => {
    storageWrite(STORAGE_KEYS.presets, userPresets);
  }, [userPresets]);

  useEffect(() => {
    if (selectedCompareIds.length > 0) storageWrite(STORAGE_KEYS.compare, selectedCompareIds);
  }, [selectedCompareIds]);

  useEffect(() => {
    if (!workflowChain.length) {
      const fallback = displayModels.filter((model) => model.installed).slice(0, 2).map((model) => model.id);
      setWorkflowChain(fallback.length ? fallback : displayModels.slice(0, 1).map((model) => model.id));
    }
  }, [displayModels, workflowChain.length]);

  const addNotification = useCallback((kind: NotificationKind, title: string, message: string) => {
    setNotifications((current) => [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        kind,
        title,
        message,
        createdAt: new Date().toISOString(),
        read: false,
      },
      ...current,
    ]);
  }, []);

  const markNotificationRead = (id: string) => {
    setNotifications((current) => current.map((item) => item.id === id ? { ...item, read: true } : item));
  };

  const clearNotifications = () => setNotifications([]);
  const markAllRead = () => setNotifications((current) => current.map((item) => ({ ...item, read: true })));

  const toggleCompareId = (id: string) => {
    setSelectedCompareIds((current) => {
      if (current.includes(id)) {
        return current.filter((item) => item !== id).slice(0, 4);
      }
      if (current.length >= 4) return current;
      return [...current, id];
    });
  };

  const compareModels = useMemo(() => {
    const ids = selectedCompareIds.length ? selectedCompareIds : displayModels.slice(0, Math.min(3, displayModels.length)).map((m) => m.id);
    const models = ids
      .map((id) => displayModels.find((model) => model.id === id))
      .filter(Boolean) as DisplayPipeline[];

    const sorted = [...models];
    if (compareSort === 'speed') sorted.sort((a, b) => a.speed_seconds - b.speed_seconds);
    if (compareSort === 'quality') sorted.sort((a, b) => estimateQuality(b) - estimateQuality(a));
    if (compareSort === 'vram') sorted.sort((a, b) => a.vram_required_mb - b.vram_required_mb);
    return sorted;
  }, [compareSort, displayModels, selectedCompareIds]);

  const performanceRows = useMemo(() => {
    return displayModels.map((model) => ({
      ...model,
      qualityScore: estimateQuality(model),
      capabilityScore:
        Number(model.supports.image_to_3d) +
        Number(model.supports.text_to_3d) +
        Number(model.supports.texture_generation) +
        Number(model.supports.rigging_animation) +
        Number(model.supports.detail_enhancement),
      loadFactor: progressValue(model.vram_required_mb, maxVram || 1),
    }));
  }, [displayModels, maxVram]);

  const workflowTotalSeconds = computeWorkflowTime(workflowChain, workflowTexture, workflowRigging, workflowDetail);
  const workflowMinVram = computeWorkflowVram(workflowChain);
  const workflowSupportsTexture = workflowChain.some((id) => displayModels.find((model) => model.id === id)?.supports.texture_generation);
  const workflowSupportsRigging = workflowChain.some((id) => displayModels.find((model) => model.id === id)?.supports.rigging_animation);
  const workflowSupportsDetail = workflowChain.some((id) => displayModels.find((model) => model.id === id)?.supports.detail_enhancement);

  const saveWorkflow = () => {
    if (!workflowName.trim()) {
      toast.error('Give the workflow a name first.');
      return;
    }

    const preset: WorkflowPreset = {
      id: generateUniqueId(),
      name: workflowName.trim(),
      description: workflowDescription.trim() || 'Custom workflow',
      source: 'custom',
      inputMode: workflowInput,
      chain: workflowChain,
      texture: workflowTexture,
      rigging: workflowRigging,
      detail: workflowDetail,
      outputFormat: workflowOutput,
      estimatedSeconds: workflowTotalSeconds,
      minVramMb: workflowMinVram,
      usageCount: 0,
      createdAt: new Date().toISOString(),
    };

    setUserWorkflows((current) => [preset, ...current]);
    setUserPresets((current) => [preset, ...current]);
    addNotification('success', 'Workflow saved', `${preset.name} is now available in Chaining and Presets.`);
    toast.success('Workflow saved locally');
    setWorkflowName('');
    setWorkflowDescription('');
  };

  const applyPreset = (preset: WorkflowPreset) => {
    setWorkflowName(preset.name);
    setWorkflowDescription(preset.description);
    setWorkflowInput(preset.inputMode);
    setWorkflowChain(preset.chain);
    setWorkflowTexture(preset.texture);
    setWorkflowRigging(preset.rigging);
    setWorkflowDetail(preset.detail);
    setWorkflowOutput(preset.outputFormat);
    setActiveTab('chaining');
    addNotification('info', 'Preset loaded', `${preset.name} applied to the workflow builder.`);
    toast.success(`Loaded ${preset.name}`);
  };

  const duplicatePreset = (preset: WorkflowPreset) => {
    const copy: WorkflowPreset = {
      ...preset,
      id: generateUniqueId(),
      name: `${preset.name} Copy`,
      source: 'custom',
      createdAt: new Date().toISOString(),
    };
    setUserPresets((current) => [copy, ...current]);
    setUserWorkflows((current) => [copy, ...current]);
    addNotification('success', 'Preset duplicated', `${copy.name} was added to your custom presets.`);
    toast.success('Preset duplicated');
  };

  const deletePreset = (id: string) => {
    setUserPresets((current) => current.filter((preset) => preset.id !== id));
    setUserWorkflows((current) => current.filter((preset) => preset.id !== id));
    addNotification('warning', 'Preset removed', 'The preset was deleted from local storage.');
    toast.success('Preset deleted');
  };

  const exportPresets = () => {
    downloadJson('ai3d-pipeline-presets.json', {
      workflows: userWorkflows,
      presets: userPresets,
      exportedAt: new Date().toISOString(),
    });
    addNotification('success', 'Export ready', 'Your local workflows and presets were exported.');
    toast.success('Exported presets');
  };

  const importPresets = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result || '{}'));
          const workflows = Array.isArray(parsed.workflows) ? parsed.workflows as WorkflowPreset[] : [];
          const presets = Array.isArray(parsed.presets) ? parsed.presets as WorkflowPreset[] : workflows;
          setUserWorkflows(workflows);
          setUserPresets(presets);
          addNotification('success', 'Import complete', 'Local workflows and presets were restored.');
          toast.success('Presets imported');
        } catch {
          toast.error('Invalid preset file.');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const runWorkflow = (preset: WorkflowPreset) => {
    addNotification('info', 'Workflow applied', `${preset.name} is ready to use in the generation flow.`);
    toast.success(`Applied ${preset.name}`);
  };

  const filteredSystemPresets = DEFAULT_WORKFLOWS.filter((preset) => {
    if (presetFilter === 'custom') return false;
    if (presetFilter === 'system') return true;
    return true;
  });

  const filteredCustomPresets = userPresets.filter((preset) => {
    const matchesFilter = presetFilter !== 'system';
    const matchesSearch =
      preset.name.toLowerCase().includes(searchPreset.toLowerCase()) ||
      preset.description.toLowerCase().includes(searchPreset.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-border bg-muted/40 p-3">
              <Layers3 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Pipelines</h1>
              <p className="text-muted-foreground">
                Compare models, plan workflows, and manage feature gating using the same visual language as the rest of the app.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <Badge variant="secondary" className="gap-1.5">
              <CheckCircle className="h-3.5 w-3.5" />
              {installedCount} installed
            </Badge>
            <Badge variant="secondary" className="gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              {enabledCount} enabled
            </Badge>
            <Badge variant="secondary" className="gap-1.5">
              <Cpu className="h-3.5 w-3.5" />
              {snapshot.total_models} in registry
            </Badge>
            <Badge variant="secondary" className="gap-1.5">
              <Flame className="h-3.5 w-3.5" />
              {featureSummary(snapshot.computed_features)} feature flags on
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start">
          <div className="relative">
            <Button variant="outline" size="icon" onClick={() => setNotificationOpen((value) => !value)} className="relative">
              <Bell className="h-4 w-4" />
              {notifications.some((item) => !item.read) && (
                <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-[hsl(var(--neon-green))] ring-2 ring-[hsl(var(--background))]" />
              )}
            </Button>

            {notificationOpen && (
              <div className="absolute right-0 top-12 z-20 w-[360px] rounded-2xl border border-border bg-card p-3 shadow-xl">
                <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
                  <div>
                    <h3 className="font-semibold">Notifications</h3>
                    <p className="text-xs text-muted-foreground">Local pipeline activity and saved workflow events.</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={markAllRead}>Mark all read</Button>
                    <Button variant="ghost" size="icon" onClick={() => setNotificationOpen(false)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="mt-3 max-h-80 space-y-2 overflow-auto pr-1">
                  {notifications.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                      No notifications yet.
                    </div>
                  ) : notifications.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => markNotificationRead(item.id)}
                      className={[
                        'w-full rounded-xl border p-3 text-left transition-colors',
                        item.read ? 'border-border bg-muted/20' : 'border-[hsl(var(--neon-green)/0.2)] bg-[hsl(var(--neon-green)/0.1)]',
                      ].join(' ')}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{item.title}</span>
                        <span className="text-[11px] text-muted-foreground">{new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{item.message}</p>
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={clearNotifications} className="flex-1">
                    Clear all
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => addNotification('info', 'Snapshot refreshed', 'Manual refresh requested from the notification panel.')} className="flex-1">
                    Add test notice
                  </Button>
                </div>
              </div>
            )}
          </div>

          <Button variant="outline" onClick={() => void onRefresh()} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabKey)} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 gap-1 overflow-auto md:grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="compare">Compare</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="chaining">Chaining</TabsTrigger>
          <TabsTrigger value="presets">Presets</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="h-4 w-4 text-[hsl(var(--neon-amber))]" />
                  Texture Generation
                </CardTitle>
                <CardDescription>Shown when texture-capable models are available.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-2xl font-semibold">{snapshot.computed_features.texture_generation ? 'Enabled' : 'Disabled'}</div>
                <p className="text-sm text-muted-foreground">
                  {snapshot.computed_features.texture_generation
                    ? 'At least one installed model supports texture output.'
                    : 'Install TripoSR, Hunyuan3D-2, or HoloPart to unlock texturing.'}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Cpu className="h-4 w-4 text-[hsl(var(--neon-blue))]" />
                  Rigging / Animation
                </CardTitle>
                <CardDescription>Enabled by UniRig.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-2xl font-semibold">{snapshot.computed_features.rigging_animation ? 'Enabled' : 'Disabled'}</div>
                <p className="text-sm text-muted-foreground">
                  {snapshot.computed_features.rigging_animation
                    ? 'UniRig is ready for post-processing and animation.'
                    : 'Install UniRig to unlock skeletal rigging.'}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Wand2 className="h-4 w-4 text-[hsl(var(--neon-purple))]" />
                  Detail Enhancement
                </CardTitle>
                <CardDescription>Shown when mesh-enhancing models are ready.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-2xl font-semibold">{snapshot.computed_features.detail_enhancement ? 'Enabled' : 'Disabled'}</div>
                <p className="text-sm text-muted-foreground">
                  {snapshot.computed_features.detail_enhancement
                    ? 'TripoSG, TripoSF, Trellis, or HoloPart can enhance mesh detail.'
                    : 'Install a detail-capable model for mesh polishing.'}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Download className="h-4 w-4 text-[hsl(var(--neon-green))]" />
                  Input Modes
                </CardTitle>
                <CardDescription>Available generation entry points.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-2xl font-semibold">{snapshot.input_modes.length}</div>
                <p className="text-sm text-muted-foreground">
                  {snapshot.input_modes.includes('text-to-3d')
                    ? 'Text-to-3D and image-to-3D are available.'
                    : 'Image-to-3D is the active generation path.'}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Feature Matrix</CardTitle>
              <CardDescription>Capability rules are evaluated from installed models plus your local enable/disable state.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {([
                ['Texture', snapshot.computed_features.texture_generation],
                ['Rigging', snapshot.computed_features.rigging_animation],
                ['Detail', snapshot.computed_features.detail_enhancement],
                ['Text-to-3D', snapshot.computed_features.text_to_3d],
                ['Image-to-3D', snapshot.computed_features.image_to_3d],
              ] as const).map(([label, active]) => {
                const isActive = Boolean(active);
                return (
                  <Badge key={label} variant={isActive ? 'default' : 'outline'} className="gap-1.5">
                    {isActive ? <CheckCircle className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                    {label}
                  </Badge>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Installed / Available Pipelines</CardTitle>
              <CardDescription>Use the switches to gate a model in the UI. Install and uninstall actions remain model-driven.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {displayModels.length === 0 ? (
                <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                  No pipelines found in the registry.
                </div>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  {displayModels.map((model) => {
                    const isBusy = Boolean(busy[model.id]);
                    return (
                      <div key={model.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-base font-semibold">{model.label}</h3>
                              {model.installed ? (
                                <span className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--neon-green)/0.2)] bg-[hsl(var(--neon-green)/0.1)] px-2 py-0.5 text-[11px] text-[hsl(var(--neon-green))]">
                                  <CheckCircle className="h-3.5 w-3.5" />
                                  Installed
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
                                  <XCircle className="h-3.5 w-3.5" />
                                  Not installed
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">{model.summary}</p>
                          </div>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              if (!model.installed) {
                                toast.error(`Install ${model.label} first before toggling it.`);
                                return;
                              }
                              try {
                                const updated = await onToggle(model);
                                if (updated) {
                                  addNotification('success', `${model.label} updated`, `${model.label} is now ${model.enabled ? 'disabled' : 'enabled'} in the local feature gate.`);
                                  toast.success(`${model.label} ${model.enabled ? 'disabled' : 'enabled'}`);
                                }
                              } catch (error) {
                                toast.error(error instanceof Error ? error.message : `Failed to toggle ${model.label}`);
                              }
                            }}
                            disabled={isBusy}
                            className="gap-2"
                          >
                            {model.enabled ? <Check className="h-4 w-4 text-[hsl(var(--neon-green))]" /> : <X className="h-4 w-4 text-muted-foreground" />}
                            {model.enabled ? 'Enabled' : 'Disabled'}
                          </Button>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          {collectCapabilities(model).map((cap) => (
                            <Badge key={cap.label} variant={cap.active ? 'default' : 'outline'} className="gap-1.5">
                              {cap.active ? <CheckCircle className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                              {cap.label}
                            </Badge>
                          ))}
                        </div>

                        <div className="mt-4 grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
                          <div>VRAM: <span className="text-foreground">{formatGigabytes(model.vram_required_mb)}</span></div>
                          <div>Speed: <span className="text-foreground">{formatSeconds(model.speed_seconds)}</span></div>
                          <div>Disk: <span className="text-foreground">{formatGigabytes(model.diskSpaceMb)}</span></div>
                          <div>Quality: <span className="text-foreground">{starRating(model.quality)}</span></div>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          {!model.installed ? (
                            <Button
                              size="sm"
                              onClick={async () => {
                                try {
                                  await onInstall(model);
                                  addNotification('info', 'Install started', `${model.label} has been queued for installation.`);
                                  toast.success(`${model.label} installation started`);
                                } catch (error) {
                                  toast.error(error instanceof Error ? error.message : `Failed to install ${model.label}`);
                                }
                              }}
                              disabled={isBusy}
                              className="gap-2"
                            >
                              <Download className="h-4 w-4" />
                              Install
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                try {
                                  await onUninstall(model);
                                  addNotification('warning', 'Uninstall started', `${model.label} has been scheduled for removal.`);
                                  toast.success(`${model.label} removal started`);
                                } catch (error) {
                                  toast.error(error instanceof Error ? error.message : `Failed to uninstall ${model.label}`);
                                }
                              }}
                              disabled={isBusy}
                              className="gap-2"
                            >
                              <Trash2 className="h-4 w-4" />
                              Uninstall
                            </Button>
                          )}

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedCompareIds((current) => current.includes(model.id) ? current.filter((id) => id !== model.id) : [...current, model.id].slice(0, 4))}
                            className="gap-2"
                          >
                            <LayoutGrid className="h-4 w-4" />
                            Compare
                          </Button>
                        </div>

                        <div className="mt-3 rounded-lg border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
                          <span className="font-medium text-foreground">Best for:</span> {model.bestFor.join(', ')}. {model.notesText}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="compare" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LayoutGrid className="h-4 w-4" />
                Compare Models
              </CardTitle>
              <CardDescription>Choose up to four models and compare their fit for your current workflow.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {displayModels.map((model) => {
                  const active = selectedCompareIds.includes(model.id);
                  return (
                    <button
                      key={model.id}
                      onClick={() => toggleCompareId(model.id)}
                      className={[
                        'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors',
                        active ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-muted/30 text-muted-foreground',
                      ].join(' ')}
                    >
                      {active ? <CheckCircle className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                      {model.label}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Sort by</span>
                {(['default', 'speed', 'quality', 'vram'] as const).map((sort) => (
                  <Button
                    key={sort}
                    variant={compareSort === sort ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setCompareSort(sort)}
                  >
                    {sort === 'default' ? 'Default' : sort === 'speed' ? 'Speed' : sort === 'quality' ? 'Quality' : 'GPU RAM'}
                  </Button>
                ))}
              </div>

              <div className="overflow-hidden rounded-2xl border border-border">
                <div className="grid border-b border-border bg-muted/40 text-sm font-medium" style={{ gridTemplateColumns: `180px repeat(${Math.max(compareModels.length, 1)}, minmax(160px, 1fr))` }}>
                  <div className="p-3">Metric</div>
                  {compareModels.map((model) => (
                    <div key={model.id} className="p-3">{model.label}</div>
                  ))}
                </div>
                {[
                  {
                    label: 'Speed',
                    render: (model: DisplayPipeline) => (
                      <div className="space-y-2">
                        <div className="font-medium text-foreground">{formatSeconds(model.speed_seconds)}</div>
                        <div className="h-2 rounded-full bg-muted">
                          <div className="h-2 rounded-full bg-primary" style={{ width: `${100 - Math.min(95, model.speed_seconds)}%` }} />
                        </div>
                      </div>
                    ),
                  },
                  {
                    label: 'Quality',
                    render: (model: DisplayPipeline) => (
                      <div className="space-y-2">
                        {starRating(model.quality)}
                        <div className="text-sm text-muted-foreground">{estimateQuality(model).toFixed(1)}/5 estimated</div>
                      </div>
                    ),
                  },
                  {
                    label: 'GPU RAM',
                    render: (model: DisplayPipeline) => (
                      <div className="space-y-2">
                        <div className="font-medium text-foreground">{formatGigabytes(model.vram_required_mb)}</div>
                        <div className="h-2 rounded-full bg-muted">
                          <div className="h-2 rounded-full bg-[hsl(var(--neon-blue))]" style={{ width: `${progressValue(model.vram_required_mb, maxVram || 1)}%` }} />
                        </div>
                      </div>
                    ),
                  },
                  {
                    label: 'Disk',
                    render: (model: DisplayPipeline) => <div className="font-medium text-foreground">{formatGigabytes(model.diskSpaceMb)}</div>,
                  },
                  {
                    label: 'Image-to-3D',
                    render: (model: DisplayPipeline) => (model.supports.image_to_3d ? '✅' : '❌'),
                  },
                  {
                    label: 'Text-to-3D',
                    render: (model: DisplayPipeline) => (model.supports.text_to_3d ? '✅' : '❌'),
                  },
                  {
                    label: 'Texture',
                    render: (model: DisplayPipeline) => (model.supports.texture_generation ? '✅' : '❌'),
                  },
                  {
                    label: 'Rigging',
                    render: (model: DisplayPipeline) => (model.supports.rigging_animation ? '✅' : '❌'),
                  },
                  {
                    label: 'Detail',
                    render: (model: DisplayPipeline) => (model.supports.detail_enhancement ? '✅' : '❌'),
                  },
                  {
                    label: 'Best for',
                    render: (model: DisplayPipeline) => (
                      <ul className="space-y-1 text-sm text-muted-foreground">
                        {model.bestFor.map((item) => <li key={item}>• {item}</li>)}
                      </ul>
                    ),
                  },
                  {
                    label: 'Workflow',
                    render: (model: DisplayPipeline) => <div className="text-sm text-muted-foreground">{model.workflow}</div>,
                  },
                  {
                    label: 'Recommendation',
                    render: (model: DisplayPipeline) => (
                      <Badge variant={model.recommendation === 'professional' ? 'default' : 'outline'} className="gap-1.5">
                        {model.recommendation === 'fast' ? <PlayCircle className="h-3.5 w-3.5" /> : model.recommendation === 'quality' ? <TrendingUp className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                        {model.recommendation}
                      </Badge>
                    ),
                  },
                ].map((row) => (
                  <div key={row.label} className="grid border-b border-border last:border-b-0" style={{ gridTemplateColumns: `180px repeat(${Math.max(compareModels.length, 1)}, minmax(160px, 1fr))` }}>
                    <div className="bg-muted/20 p-3 text-sm font-medium">{row.label}</div>
                    {compareModels.map((model) => (
                      <div key={model.id} className="p-3 text-sm">
                        {row.render(model)}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Registry Coverage</CardTitle>
                <CardDescription>Total known models and install state.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{snapshot.total_models}</div>
                <p className="mt-2 text-sm text-muted-foreground">{installedCount} installed, {readyCount} ready, {displayModels.length - installedCount} available.</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Feature Coverage</CardTitle>
                <CardDescription>How many feature gates are currently on.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{featureSummary(snapshot.computed_features)}/5</div>
                <p className="mt-2 text-sm text-muted-foreground">Feature flags are derived from the installed and enabled models only.</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Average Speed</CardTitle>
                <CardDescription>Registry-level speed estimate.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{avgSpeed}s</div>
                <p className="mt-2 text-sm text-muted-foreground">Lower values mean the model is faster for preview and iteration.</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Peak VRAM</CardTitle>
                <CardDescription>Largest requirement in the snapshot.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{formatGigabytes(maxVram)}</div>
                <p className="mt-2 text-sm text-muted-foreground">Useful for deciding whether to keep heavier models enabled.</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Estimated Resource Footprint</CardTitle>
                <CardDescription>Speed and VRAM from the current registry snapshot.</CardDescription>
              </CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={performanceRows}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="speed_seconds" name="Speed (s)" />
                    <Bar dataKey="vram_required_mb" name="VRAM (MB)" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Quality vs Speed</CardTitle>
                <CardDescription>Higher quality and lower speed are the sweet spot.</CardDescription>
              </CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" dataKey="speed_seconds" name="Speed" />
                    <YAxis type="number" dataKey="qualityScore" name="Quality" domain={[0, 5]} />
                    <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                    <Scatter name="Models" data={performanceRows} fill="currentColor" />
                  </ScatterChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Model Profile Table</CardTitle>
              <CardDescription>The table below helps decide what to keep enabled for a given workflow.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-3 pr-4 font-medium">Model</th>
                    <th className="py-3 pr-4 font-medium">Status</th>
                    <th className="py-3 pr-4 font-medium">Speed</th>
                    <th className="py-3 pr-4 font-medium">Quality</th>
                    <th className="py-3 pr-4 font-medium">Feature score</th>
                    <th className="py-3 pr-4 font-medium">VRAM</th>
                  </tr>
                </thead>
                <tbody>
                  {performanceRows.map((row) => (
                    <tr key={row.id} className="border-b border-border/60 last:border-b-0">
                      <td className="py-3 pr-4 font-medium">{row.label}</td>
                      <td className="py-3 pr-4">
                        <Badge variant={row.installed ? 'default' : 'outline'}>
                          {row.status}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4">{formatSeconds(row.speed_seconds)}</td>
                      <td className="py-3 pr-4">{starRating(row.quality)}</td>
                      <td className="py-3 pr-4">{row.capabilityScore}/5</td>
                      <td className="py-3 pr-4">{formatGigabytes(row.vram_required_mb)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="chaining" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowRight className="h-4 w-4" />
                Workflow Builder
              </CardTitle>
              <CardDescription>Create chained workflows from the models currently in your registry.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-3">
                <Card className="border-dashed">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">1. Input</CardTitle>
                    <CardDescription>Choose how the pipeline starts.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {(['image', 'text', 'mesh'] as const).map((mode) => (
                      <Button
                        key={mode}
                        variant={workflowInput === mode ? 'default' : 'outline'}
                        className="w-full justify-start"
                        onClick={() => setWorkflowInput(mode)}
                      >
                        {mode === 'image' ? 'Image upload' : mode === 'text' ? 'Text prompt' : 'Existing mesh'}
                      </Button>
                    ))}
                  </CardContent>
                </Card>

                <Card className="border-dashed">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">2. Model chain</CardTitle>
                    <CardDescription>Pick the models to run in sequence.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {displayModels.map((model) => {
                      const active = workflowChain.includes(model.id);
                      return (
                        <Button
                          key={model.id}
                          variant={active ? 'default' : 'outline'}
                          className="w-full justify-start"
                          onClick={() => {
                            setWorkflowChain((current) => current.includes(model.id) ? current.filter((id) => id !== model.id) : [...current, model.id]);
                          }}
                        >
                          {active ? <CheckCircle className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
                          {model.label}
                        </Button>
                      );
                    })}
                  </CardContent>
                </Card>

                <Card className="border-dashed">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">3. Post-processing</CardTitle>
                    <CardDescription>Optional finish-up steps.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                      <span className="text-sm">Texture generation</span>
                      <input type="checkbox" checked={workflowTexture} onChange={(event) => setWorkflowTexture(event.target.checked)} />
                    </label>
                    <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                      <span className="text-sm">Rigging / animation</span>
                      <input type="checkbox" checked={workflowRigging} onChange={(event) => setWorkflowRigging(event.target.checked)} />
                    </label>
                    <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                      <span className="text-sm">Detail enhancement</span>
                      <input type="checkbox" checked={workflowDetail} onChange={(event) => setWorkflowDetail(event.target.checked)} />
                    </label>
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Workflow summary</CardTitle>
                    <CardDescription>Current chain preview.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="rounded-2xl border border-border bg-muted/20 p-4">
                      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        <Badge variant="outline">{workflowInput}</Badge>
                        {workflowChain.map((id, index) => (
                          <React.Fragment key={id}>
                            <ArrowRight className="h-4 w-4" />
                            <Badge>{MODEL_LIBRARY[id]?.label || id}</Badge>
                            {index === workflowChain.length - 1 && workflowTexture && (
                              <>
                                <ArrowRight className="h-4 w-4" />
                                <Badge variant="outline">texture</Badge>
                              </>
                            )}
                            {index === workflowChain.length - 1 && workflowRigging && (
                              <>
                                <ArrowRight className="h-4 w-4" />
                                <Badge variant="outline">rigging</Badge>
                              </>
                            )}
                          </React.Fragment>
                        ))}
                        {workflowChain.length === 0 && <span>No models selected yet.</span>}
                        <ArrowRight className="h-4 w-4" />
                        <Badge variant="outline">{workflowOutput.toUpperCase()}</Badge>
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-xl border border-border p-3">
                        <div className="text-xs text-muted-foreground">Estimated time</div>
                        <div className="mt-1 text-lg font-semibold">{workflowTotalSeconds}s</div>
                      </div>
                      <div className="rounded-xl border border-border p-3">
                        <div className="text-xs text-muted-foreground">Min VRAM</div>
                        <div className="mt-1 text-lg font-semibold">{formatGigabytes(workflowMinVram)}</div>
                      </div>
                      <div className="rounded-xl border border-border p-3">
                        <div className="text-xs text-muted-foreground">Ready for</div>
                        <div className="mt-1 text-lg font-semibold">
                          {workflowTexture || workflowSupportsTexture ? 'Textures' : workflowRigging || workflowSupportsRigging ? 'Rigging' : workflowDetail || workflowSupportsDetail ? 'Details' : 'Preview'}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button onClick={() => runWorkflow({
                        id: 'preview',
                        name: workflowName || 'Custom Workflow',
                        description: workflowDescription || 'Custom workflow',
                        source: 'custom',
                        inputMode: workflowInput,
                        chain: workflowChain,
                        texture: workflowTexture,
                        rigging: workflowRigging,
                        detail: workflowDetail,
                        outputFormat: workflowOutput,
                        estimatedSeconds: workflowTotalSeconds,
                        minVramMb: workflowMinVram,
                        usageCount: 0,
                        createdAt: new Date().toISOString(),
                      })}>
                        <PlayCircle className="mr-2 h-4 w-4" />
                        Use workflow
                      </Button>
                      <Button variant="outline" onClick={saveWorkflow}>
                        <Save className="mr-2 h-4 w-4" />
                        Save workflow
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Save details</CardTitle>
                    <CardDescription>Name and describe this chain.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <input
                      value={workflowName}
                      onChange={(event) => setWorkflowName(event.target.value)}
                      placeholder="Professional Workflow"
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none ring-0 placeholder:text-muted-foreground focus:border-primary"
                    />
                    <textarea
                      value={workflowDescription}
                      onChange={(event) => setWorkflowDescription(event.target.value)}
                      placeholder="Image to mesh, then rig, then texture"
                      className="min-h-28 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
                    />
                    <div className="rounded-xl border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
                      Texture-capable chain: {workflowTexture || workflowSupportsTexture ? 'Yes' : 'No'}<br />
                      Rigging-capable chain: {workflowRigging || workflowSupportsRigging ? 'Yes' : 'No'}<br />
                      Detail-capable chain: {workflowDetail || workflowSupportsDetail ? 'Yes' : 'No'}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Saved workflows</CardTitle>
                  <CardDescription>Workflows are persisted locally so you can continue where you left off.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {userWorkflows.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                      No custom workflows saved yet.
                    </div>
                  ) : userWorkflows.map((preset) => (
                    <div key={preset.id} className="rounded-xl border border-border bg-muted/20 p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium">{preset.name}</h4>
                            <Badge variant="outline">custom</Badge>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">{preset.description}</p>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                            <span>{preset.chain.map((id) => MODEL_LIBRARY[id]?.label ?? id).join(' → ')}</span>
                            <span>• {preset.estimatedSeconds}s</span>
                            <span>• {formatGigabytes(preset.minVramMb)}</span>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button variant="outline" size="sm" onClick={() => applyPreset(preset)}>
                            <Download className="mr-2 h-4 w-4" />
                            Use
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => duplicatePreset(preset)}>
                            <Plus className="mr-2 h-4 w-4" />
                            Duplicate
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => deletePreset(preset.id)}>
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="presets" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Custom Presets Manager</CardTitle>
              <CardDescription>Save, duplicate, export, and import workflow combinations.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <input
                    value={searchPreset}
                    onChange={(event) => setSearchPreset(event.target.value)}
                    placeholder="Search presets..."
                    className="w-full rounded-xl border border-border bg-background py-2 pl-10 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  {(['all', 'system', 'custom'] as const).map((filter) => (
                    <Button
                      key={filter}
                      variant={presetFilter === filter ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setPresetFilter(filter)}
                    >
                      {filter === 'all' ? 'All' : filter === 'system' ? 'System' : 'Custom'}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Default presets</CardTitle>
                    <CardDescription>Provided by the current pipeline design.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {filteredSystemPresets.map((preset) => (
                      <div key={preset.id} className="rounded-xl border border-border bg-muted/20 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium">{preset.name}</h4>
                              <Badge variant="outline">system</Badge>
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">{preset.description}</p>
                            <div className="mt-2 text-xs text-muted-foreground">
                              {preset.chain.map((id) => MODEL_LIBRARY[id]?.label ?? id).join(' → ')}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <span className="text-sm text-muted-foreground">{preset.estimatedSeconds}s</span>
                            <Button variant="outline" size="sm" onClick={() => applyPreset(preset)}>Use</Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Your presets</CardTitle>
                    <CardDescription>Persisted locally for the browser session.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={exportPresets}>
                        Export all
                      </Button>
                      <Button variant="outline" size="sm" onClick={importPresets}>
                        Import
                      </Button>
                    </div>

                    {filteredCustomPresets.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                        No matching custom presets yet.
                      </div>
                    ) : filteredCustomPresets.map((preset) => (
                      <div key={preset.id} className="rounded-xl border border-border bg-muted/20 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium">{preset.name}</h4>
                              <Badge variant="outline">custom</Badge>
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">{preset.description}</p>
                            <div className="mt-2 text-xs text-muted-foreground">
                              {preset.chain.map((id) => MODEL_LIBRARY[id]?.label ?? id).join(' → ')}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <div className="text-sm text-muted-foreground">{preset.usageCount} uses</div>
                            <div className="flex gap-2">
                              <Button variant="outline" size="sm" onClick={() => applyPreset(preset)}>Use</Button>
                              <Button variant="ghost" size="sm" onClick={() => duplicatePreset(preset)}>Duplicate</Button>
                              <Button variant="ghost" size="sm" onClick={() => deletePreset(preset.id)}>Delete</Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
