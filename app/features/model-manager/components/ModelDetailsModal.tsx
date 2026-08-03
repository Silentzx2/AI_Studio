"use client";

import React, { useState, useEffect } from 'react';
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
  AlertTriangle
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
  const [activeTab, setActiveTab] = useState<'info' | 'health' | 'requirements'>('info');

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
      // Fetch manifest and health in parallel
      const [manifestRes, healthRes] = await Promise.all([
        fetch(`/api/v1/models/${modelId}`),
        fetch(`/api/v1/models/${modelId}/health`)
      ]);

      const manifestData = await manifestRes.json();
      const healthData = await healthRes.json();

      if (manifestData.success) {
        setManifest(manifestData.data?.manifest || manifestData.data);
      }

      if (healthData.success) {
        setHealth(healthData.data);
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
      <div className="relative w-full max-w-3xl max-h-[85vh] overflow-hidden rounded-xl border border-white/20 bg-gray-900/95 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <Package className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">
                {manifest?.name || modelId}
              </h2>
              <p className="text-sm text-white/50 font-mono">{modelId}</p>
            </div>
          </div>
          
          {/* Status Badge */}
          {health && (
            <Badge className={
              health.status === 'healthy' ? 'bg-green-500/20 text-green-400 border-green-500/30' :
              health.status === 'warning' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
              'bg-red-500/20 text-red-400 border-red-500/30'
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
            className="text-white/60 hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-4 border-b border-white/10">
          {[
            { id: 'info', label: 'Information', icon: Info },
            { id: 'health', label: 'Health Check', icon: HeartPulse },
            { id: 'requirements', label: 'Requirements', icon: Settings }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-white border-b-2 border-purple-500'
                  : 'text-white/50 hover:text-white/80'
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
              <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
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
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-white/10 bg-black/20">
          <Button
            variant="outline"
            onClick={onClose}
            className="border-white/20 text-white hover:bg-white/10"
          >
            Close
          </Button>
          
          {onRepair && health?.status !== 'healthy' && (
            <Button
              variant="outline"
              onClick={() => onRepair(modelId)}
              className="border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10"
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
              className="border-red-500/50 text-red-400 hover:bg-red-500/10"
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
              className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
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
      <div className="text-center py-8 text-white/50">
        No information available for this model.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Description */}
      {manifest.description && (
        <div>
          <h4 className="text-sm font-medium text-white/60 mb-2">Description</h4>
          <p className="text-white/80 leading-relaxed">{manifest.description}</p>
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
          <h4 className="text-sm font-medium text-white/60 mb-3">Capabilities</h4>
          <div className="flex flex-wrap gap-2">
            {manifest.capabilities.map((cap, idx) => (
              <Badge key={idx} variant="secondary" className="bg-white/10 text-white/80">
                {cap.replace('-', ' ').replace('_', ' ')}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Tags */}
      {manifest.tags && manifest.tags.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-white/60 mb-3">Tags</h4>
          <div className="flex flex-wrap gap-2">
            {manifest.tags.map((tag, idx) => (
              <Badge key={idx} variant="outline" className="border-white/20 text-white/60">
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
      <div className="text-center py-8 text-white/50">
        Health check data not available.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      {health.summary && (
        <Card className="bg-black/30 border-white/10 p-4">
          <div className="grid grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-white">{health.summary.total_checks}</p>
              <p className="text-xs text-white/50">Total Checks</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-green-400">{health.summary.passed}</p>
              <p className="text-xs text-green-400/70">Passed</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-yellow-400">{health.summary.warnings}</p>
              <p className="text-xs text-yellow-400/70">Warnings</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-red-400">{health.summary.errors}</p>
              <p className="text-xs text-red-400/70">Errors</p>
            </div>
          </div>
        </Card>
      )}

      {/* Individual Checks */}
      {health.checks && Object.entries(health.checks).map(([checkName, result]: [string, any]) => (
        <Card key={checkName} className={`p-4 ${
          result.status === 'ok' ? 'border-green-500/20' :
          result.status === 'warning' ? 'border-yellow-500/20' : 'border-red-500/20'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium text-white capitalize">
              {checkName.replace('_', ' ')}
            </span>
            <span className={`text-sm font-medium ${
              result.status === 'ok' ? 'text-green-400' :
              result.status === 'warning' ? 'text-yellow-400' : 'text-red-400'
            }`}>
              {result.status.toUpperCase()}
            </span>
          </div>
          {result.message && (
            <p className="text-sm text-white/50">{result.message}</p>
          )}
        </Card>
      ))}

      {/* Timestamp */}
      {health.timestamp && (
        <p className="text-xs text-white/30 text-right">
          Last checked: {new Date(health.timestamp).toLocaleString()}
        </p>
      )}
    </div>
  );
}

// Requirements Tab Component
function RequirementsTab({ manifest }: { manifest: ModelManifest | null }) {
  if (!manifest) {
    return <div className="text-center py-8 text-white/50">No requirements data.</div>;
  }

  const runtime = manifest.runtime || {};
  const deps = manifest.dependencies || {};
  const pythonPackages = deps.python_packages || [];

  return (
    <div className="space-y-6">
      {/* System Requirements */}
      <div>
        <h4 className="text-sm font-medium text-white/60 mb-4 flex items-center gap-2">
          <Cpu className="w-4 h-4" />
          System Requirements
        </h4>
        
        <div className="space-y-3">
          <RequirementRow 
            icon={<Package className="w-5 h-5 text-blue-400" />}
            label="Framework"
            value={runtime.framework || 'Unknown'}
          />
          
          <RequirementRow 
            icon={<Shield className="w-5 h-5 text-green-400" />}
            label="Python Version"
            value={runtime.python_version || '3.10+'}
          />
          
          <RequirementRow 
            icon={<Cpu className="w-5 h-5 text-purple-400" />}
            label="CUDA Required"
            value={runtime.cuda_required ? 'Yes' : 'Optional'}
            highlight={runtime.cuda_required ? 'warning' : undefined}
          />
          
          <RequirementRow 
            icon={<HardDrive className="w-5 h-5 text-orange-400" />}
            label="Minimum VRAM"
            value={runtime.min_vram_mb ? `${(runtime.min_vram_mb / 1024).toFixed(1)} GB` : '4 GB+'}
          />
        </div>
      </div>

      {/* Python Dependencies */}
      {pythonPackages.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-white/60 mb-4 flex items-center gap-2">
            <Package className="w-4 h-4" />
            Python Dependencies ({pythonPackages.length})
          </h4>
          
          <div className="bg-black/30 rounded-lg overflow-hidden">
            {pythonPackages.map((pkg, idx) => (
              <div 
                key={idx}
                className={`flex items-center justify-between px-4 py-2 ${
                  idx !== pythonPackages.length - 1 ? 'border-b border-white/5' : ''
                }`}
              >
                <code className="text-sm text-blue-300">{pkg.name}</code>
                {pkg.version && (
                  <span className="text-sm text-white/40">{pkg.version}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Files */}
      {manifest.files && manifest.files.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-white/60 mb-4 flex items-center gap-2">
            <HardDrive className="w-4 h-4" />
            Model Files ({manifest.files.length})
          </h4>
          
          <div className="bg-black/30 rounded-lg p-4 space-y-2">
            {manifest.files.map((file, idx) => (
              <div key={idx} className="flex items-center gap-2 text-sm text-white/70">
                <CheckCircle className="w-4 h-4 text-green-400/50" />
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
    <div className="bg-black/20 rounded-lg p-3">
      <p className="text-xs text-white/50 mb-1">{label}</p>
      <p className="font-medium text-white">{value}</p>
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
      highlight === 'warning' ? 'bg-yellow-500/10' :
      highlight === 'error' ? 'bg-red-500/10' : 'bg-black/20'
    }`}>
      {icon}
      <span className="text-white/70 flex-1">{label}</span>
      <span className={`font-medium ${
        highlight ? 'text-yellow-400' : 'text-white'
      }`}>{value}</span>
    </div>
  );
}
