"use client";

import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  X,
  Download,
  Trash2,
  HeartPulse,
  Settings,
  Info,
  Package,
  HardDrive,
  Cpu,
  Clock,
  Shield,
  ExternalLink,
  CheckCircle,
  AlertTriangle,
  Loader2,
  AlertCircle
} from 'lucide-react';

interface ModelManifest {
  id?: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  category: string;
  capabilities: string[];
  tags?: string[];
  runtime: {
    framework: string;
    python_version?: string;
    cuda_required?: boolean;
    min_vram_mb?: number;
  };
  files?: string[];
  dependencies?: {
    python_packages?: Array<{name: string; version?: string}>;
  };
  [key: string]: any;
}

interface ModelDetailsModalProps {
  modelId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onDownload?: (modelId: string) => void;
  onUninstall?: (modelId: string) => void;
  onRepair?: (modelId: string) => void;
}

export function ModelDetailsModal({
  modelId,
  isOpen,
  onClose,
  onDownload,
  onUninstall,
  onRepair
}: ModelDetailsModalProps) {
  const [manifest, setManifest] = useState<ModelManifest | null>(null);
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'health' | 'requirements' | 'native_build'>('info');
  const [installStatus, setInstallStatus] = useState<any>(null);

  // Fetch model details when modal opens
  useEffect(() => {
    if (isOpen && modelId) {
      fetchModelDetails();
    }
  }, [isOpen, modelId]);

  const fetchModelDetails = async () => {
    if (!modelId) return;

    setLoading(true);
    
    try {
      const [manifestRes, healthRes, statusRes] = await Promise.all([
        fetch(`/api/v1/models/${modelId}`),
        fetch(`/api/v1/models/${modelId}/health`),
        fetch(`/api/v1/admin/install/status`).catch(() => null),
      ]);

      const manifestData = manifestRes.ok ? await manifestRes.json() : {};
      const healthData = healthRes.ok ? await healthRes.json() : {};
      const statusData = statusRes?.ok ? await statusRes.json() : {};

      if (manifestData.success) {
        setManifest(manifestData.data?.manifest || manifestData.data);
      }

      if (healthData.success) {
        setHealth(healthData.data);
      }

      if (statusData?.data?.[modelId]) {
        setInstallStatus(statusData.data[modelId]);
      }
    } catch (error) {
      console.error('Failed to fetch model details:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !modelId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative w-full max-w-3xl max-h-[85vh] overflow-hidden rounded-xl border border-[hsl(var(--border))/0.2] bg-[hsl(var(--surface-0))/0.95] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[hsl(var(--border))]/[0.3]">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <Package className="w-6 h-6 text-[hsl(var(--foreground))]" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[hsl(var(--foreground))]">
                {manifest?.name || modelId}
              </h2>
              <p className="text-sm text-[hsl(var(--foreground))]/50 font-mono">{modelId}</p>
            </div>
          </div>
          
          {/* Status Badge */}
          {health && (
            <Badge className={
              health.status === 'healthy' ? 'bg-[hsl(var(--neon-green)/0.2)] text-[hsl(var(--neon-green))] border-[hsl(var(--neon-green))]/30' :
              health.status === 'warning' ? 'bg-[hsl(var(--neon-amber)/0.2)] text-[hsl(var(--neon-amber))] border-[hsl(var(--neon-amber)/0.3)]' :
              'bg-[hsl(var(--destructive)/0.2)] text-[hsl(var(--destructive))] border-[hsl(var(--destructive)/0.3)]'
            }>
              {health.status === 'healthy' && <CheckCircle className="w-3 h-3 mr-1" />}
              {health.status === 'warning' && <AlertTriangle className="w-3 h-3 mr-1" />}
              {health.status}
            </Badge>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-[hsl(var(--foreground))]/60 hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))]"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-4 border-b border-[hsl(var(--border))]/[0.3]">
          {[
            { id: 'info', label: 'Information', icon: Info },
            { id: 'health', label: 'Health Check', icon: HeartPulse },
            { id: 'requirements', label: 'Requirements', icon: Settings },
            { id: 'native_build', label: 'Native Build', icon: Cpu }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-[hsl(var(--foreground))] border-b-2 border-[hsl(var(--primary))]'
                  : 'text-[hsl(var(--foreground))]/50 hover:text-[hsl(var(--foreground))]/80'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(85vh-200px)]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-[hsl(var(--primary))] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {activeTab === 'info' && (
                <InfoTab manifest={manifest} modelId={modelId} />
              )}
              
              {activeTab === 'health' && (
                <HealthTabContent health={health} />
              )}
              
              {activeTab === 'requirements' && (
                <RequirementsTab manifest={manifest} />
              )}
              
              {activeTab === 'native_build' && (
                <div className="space-y-4">
                  <h4 className="text-sm font-medium text-[hsl(var(--foreground))]/60">Native Build Status</h4>
                  {installStatus?.components?.native_build ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          'text-xs font-medium px-2 py-1 rounded-md',
                          installStatus.components.native_build.state === 'not_required' && 'bg-[hsl(var(--muted-foreground)/0.08)] text-[hsl(var(--muted-foreground))]',
                          installStatus.components.native_build.state === 'pending' && 'bg-[hsl(var(--amber-500)/0.15)] text-[hsl(var(--amber-500))]',
                          installStatus.components.native_build.state === 'running' && 'bg-[hsl(var(--blue-500)/0.15)] text-[hsl(var(--blue-500))]',
                          installStatus.components.native_build.state === 'complete' && 'bg-[hsl(var(--green-500)/0.15)] text-[hsl(var(--green-500))]',
                          installStatus.components.native_build.state === 'failed' && 'bg-[hsl(var(--red-500)/0.15)] text-[hsl(var(--red-500))]',
                        )}>
                          {installStatus.components.native_build.state}
                        </span>
                        {installStatus.components.native_build.task_id && (
                          <span className="text-[10px] font-mono text-muted-foreground">
                            Task: {installStatus.components.native_build.task_id}
                          </span>
                        )}
                      </div>
                      {installStatus.components.native_build.current_step && (
                        <div className="text-xs text-[hsl(var(--foreground))]/70 bg-[hsl(var(--surface-2)/0.4)] p-3 rounded-lg">
                          <span className="font-medium">Current step:</span> {installStatus.components.native_build.current_step}
                        </div>
                      )}
                      {installStatus.components.native_build.output && (
                        <div className="text-xs text-[hsl(var(--foreground))]/60 bg-[hsl(var(--surface-2)/0.2)] p-3 rounded-lg font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">
                          {installStatus.components.native_build.output}
                        </div>
                      )}
                      {installStatus.components.native_build.detail && (
                        <p className="text-xs text-[hsl(var(--foreground))]/70 bg-[hsl(var(--surface-2)/0.4)] p-3 rounded-lg">
                          {installStatus.components.native_build.detail}
                        </p>
                      )}
                      <div className="flex items-center gap-2">
                        {installStatus.components.native_build.state === 'failed' && onRepair && (
                          <Button
                            variant="outline"
                            onClick={() => onRepair(modelId)}
                            className="border-[hsl(var(--neon-amber)/0.5)] text-[hsl(var(--neon-amber))] hover:bg-[hsl(var(--neon-amber)/0.1)]"
                          >
                            <Settings className="w-4 h-4 mr-2" />
                            Repair Model
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.open('/settings', '_blank')}
                          className="text-[hsl(var(--foreground))]/60 hover:text-[hsl(var(--foreground))]"
                        >
                          View Logs
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-[hsl(var(--foreground))]/40">No native build information available.</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-[hsl(var(--border))]/[0.3] bg-[hsl(var(--surface-0)/0.2)]">
          <Button
            variant="outline"
            onClick={onClose}
            className="border-[hsl(var(--border))/0.2] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))]"
          >
            Close
          </Button>
          
          {onRepair && health?.status !== 'healthy' && (
            <Button
              variant="outline"
              onClick={() => onRepair(modelId)}
              className="border-[hsl(var(--neon-amber)/0.5)] text-[hsl(var(--neon-amber))] hover:bg-[hsl(var(--neon-amber)/0.1)]"
            >
              <Settings className="w-4 h-4 mr-2" />
              Repair Model
            </Button>
          )}
          
          {onUninstall && (
            <Button
              variant="outline"
              onClick={() => {
                onUninstall(modelId);
                onClose();
              }}
              className="border-[hsl(var(--destructive)/0.5)] text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive)/0.1)]"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Uninstall
            </Button>
          )}
          
          {onDownload && (
            <Button
              onClick={() => {
                onDownload(modelId);
                onClose();
              }}
              className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-[hsl(var(--foreground))]"
            >
              <Download className="w-4 h-4 mr-2" />
              Download / Install
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// Information Tab Component
function InfoTab({ manifest, modelId }: { manifest: ModelManifest | null; modelId: string }) {
  if (!manifest) {
    return (
      <div className="text-center py-8 text-[hsl(var(--foreground))]/50">
        No information available for this model.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Description */}
      {manifest.description && (
        <div>
          <h4 className="text-sm font-medium text-[hsl(var(--foreground))]/60 mb-2">Description</h4>
          <p className="text-[hsl(var(--foreground))]/80 leading-relaxed">{manifest.description}</p>
        </div>
      )}

      {/* Metadata Grid */}
      <div className="grid grid-cols-2 gap-4">
        <InfoItem label="Version" value={manifest.version} />
        <InfoItem label="Author" value={manifest.author || 'Unknown'} />
        <InfoItem label="Category" value={manifest.category} />
        <InfoItem 
          label="Framework" 
          value={manifest.runtime?.framework || 'Unknown'} 
        />
      </div>

      {/* Capabilities */}
      {manifest.capabilities && manifest.capabilities.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-[hsl(var(--foreground))]/60 mb-3">Capabilities</h4>
          <div className="flex flex-wrap gap-2">
            {manifest.capabilities.map((cap, idx) => (
              <Badge key={idx} variant="secondary" className="bg-[hsl(var(--surface-2))] text-[hsl(var(--foreground))]/80">
                {cap.replace('-', ' ').replace('_', ' ')}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Tags */}
      {manifest.tags && manifest.tags.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-[hsl(var(--foreground))]/60 mb-3">Tags</h4>
          <div className="flex flex-wrap gap-2">
            {manifest.tags.map((tag, idx) => (
              <Badge key={idx} variant="outline" className="border-[hsl(var(--border))/0.2] text-[hsl(var(--foreground))]/60">
                #{tag}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Health Tab Content
function HealthTabContent({ health }: { health: any }) {
  if (!health) {
    return (
      <div className="text-center py-8 text-[hsl(var(--foreground))]/50">
        Health check data not available.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      {health.summary && (
        <Card className="bg-[hsl(var(--surface-0)/0.3)] border-[hsl(var(--border))]/[0.3] p-4">
          <div className="grid grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-[hsl(var(--foreground))]">{health.summary.total_checks}</p>
              <p className="text-xs text-[hsl(var(--foreground))]/50">Total Checks</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-[hsl(var(--neon-green))]">{health.summary.passed}</p>
              <p className="text-xs text-[hsl(var(--neon-green))]/70">Passed</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-[hsl(var(--neon-amber))]">{health.summary.warnings}</p>
              <p className="text-xs text-[hsl(var(--neon-amber))]/70">Warnings</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-[hsl(var(--destructive))]">{health.summary.errors}</p>
              <p className="text-xs text-[hsl(var(--destructive))]/70">Errors</p>
            </div>
          </div>
        </Card>
      )}

      {/* Individual Checks */}
      {health.checks && Object.entries(health.checks).map(([checkName, result]: [string, any]) => (
        <Card key={checkName} className={`p-4 ${
          result.status === 'ok' ? 'border-[hsl(var(--neon-green)/0.2)]' :
          result.status === 'warning' ? 'border-[hsl(var(--neon-amber)/0.2)]' : 'border-[hsl(var(--destructive)/0.2)]'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium text-[hsl(var(--foreground))] capitalize">
              {checkName.replace('_', ' ')}
            </span>
            <span className={`text-sm font-medium ${
              result.status === 'ok' ? 'text-[hsl(var(--neon-green))]' :
              result.status === 'warning' ? 'text-[hsl(var(--neon-amber))]' : 'text-[hsl(var(--destructive))]'
            }`}>
              {result.status.toUpperCase()}
            </span>
          </div>
          {result.message && (
            <p className="text-sm text-[hsl(var(--foreground))]/50">{result.message}</p>
          )}
        </Card>
      ))}

      {/* Timestamp */}
      {health.timestamp && (
        <p className="text-xs text-[hsl(var(--foreground))]/30 text-right">
          Last checked: {new Date(health.timestamp).toLocaleString()}
        </p>
      )}
    </div>
  );
}

// Requirements Tab Component
function RequirementsTab({ manifest }: { manifest: ModelManifest | null }) {
  if (!manifest) {
    return <div className="text-center py-8 text-[hsl(var(--foreground))]/50">No requirements data.</div>;
  }

  const runtime = manifest.runtime || {};
  const deps = manifest.dependencies || {};
  const pythonPackages = deps.python_packages || [];

  return (
    <div className="space-y-6">
      {/* System Requirements */}
      <div>
        <h4 className="text-sm font-medium text-[hsl(var(--foreground))]/60 mb-4 flex items-center gap-2">
          <Cpu className="w-4 h-4" />
          System Requirements
        </h4>
        
        <div className="space-y-3">
          <RequirementRow 
            icon={<Package className="w-5 h-5 text-[hsl(var(--neon-blue))]" />}
            label="Framework"
            value={runtime.framework || 'Unknown'}
          />
          
          <RequirementRow 
            icon={<Shield className="w-5 h-5 text-[hsl(var(--neon-green))]" />}
            label="Python Version"
            value={runtime.python_version || '3.10+'}
          />
          
          <RequirementRow 
            icon={<Cpu className="w-5 h-5 text-[hsl(var(--neon-purple))]" />}
            label="CUDA Required"
            value={runtime.cuda_required ? 'Yes' : 'Optional'}
            highlight={runtime.cuda_required ? 'warning' : undefined}
          />
          
          <RequirementRow 
            icon={<HardDrive className="w-5 h-5 text-[hsl(var(--neon-amber))]" />}
            label="Minimum VRAM"
            value={runtime.min_vram_mb ? `${(runtime.min_vram_mb / 1024).toFixed(1)} GB` : '4 GB+'}
          />
        </div>
      </div>

      {/* Python Dependencies */}
      {pythonPackages.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-[hsl(var(--foreground))]/60 mb-4 flex items-center gap-2">
            <Package className="w-4 h-4" />
            Python Dependencies ({pythonPackages.length})
          </h4>
          
          <div className="bg-[hsl(var(--surface-0)/0.3)] rounded-lg overflow-hidden">
            {pythonPackages.map((pkg, idx) => (
              <div 
                key={idx}
                className={`flex items-center justify-between px-4 py-2 ${
                  idx !== pythonPackages.length - 1 ? 'border-b border-[hsl(var(--border))]/[0.15]' : ''
                }`}
              >
                <code className="text-sm text-[hsl(var(--neon-blue))]">{pkg.name}</code>
                {pkg.version && (
                  <span className="text-sm text-[hsl(var(--foreground))]/40">{pkg.version}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Files */}
      {manifest.files && manifest.files.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-[hsl(var(--foreground))]/60 mb-4 flex items-center gap-2">
            <HardDrive className="w-4 h-4" />
            Model Files ({manifest.files.length})
          </h4>
          
          <div className="bg-[hsl(var(--surface-0)/0.3)] rounded-lg p-4 space-y-2">
            {manifest.files.map((file, idx) => (
              <div key={idx} className="flex items-center gap-2 text-sm text-[hsl(var(--foreground))]/70">
                <CheckCircle className="w-4 h-4 text-[hsl(var(--neon-green))]/50" />
                <code>{file}</code>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Helper Components
function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[hsl(var(--surface-0)/0.2)] rounded-lg p-3">
      <p className="text-xs text-[hsl(var(--foreground))]/50 mb-1">{label}</p>
      <p className="font-medium text-[hsl(var(--foreground))]">{value}</p>
    </div>
  );
}

function RequirementRow({ 
  icon, 
  label, 
  value, 
  highlight 
}: { 
  icon: React.ReactNode; 
  label: string; 
  value: string; 
  highlight?: 'warning' | 'error'; 
}) {
  return (
    <div className={`flex items-center gap-4 p-3 rounded-lg ${
      highlight === 'warning' ? 'bg-[hsl(var(--neon-amber)/0.1)]' :
      highlight === 'error' ? 'bg-[hsl(var(--destructive)/0.1)]' : 'bg-[hsl(var(--surface-0)/0.2)]'
    }`}>
      {icon}
      <span className="text-[hsl(var(--foreground))]/70 flex-1">{label}</span>
      <span className={`font-medium ${
        highlight ? 'text-[hsl(var(--neon-amber))]' : 'text-[hsl(var(--foreground))]'
      }`}>{value}</span>
    </div>
  );
}
