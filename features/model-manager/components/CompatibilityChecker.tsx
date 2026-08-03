"use client";

import React, { useEffect, useState } from 'react';
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, AlertTriangle, XCircle } from 'lucide-react';

interface SystemInfo {
  gpu_available: boolean;
  vram_total_mb: number;
  vram_free_mb: number;
  cuda_version: string;
  python_version: string;
  os: string;
  architecture: string;
  disk_free_mb: number;
  system_ram_mb: number;
  docker_available: boolean;
}

interface CompatibilityResult {
  compatible: boolean;
  warnings: string[];
  errors: string[];
  requirements: {
    vram: { required: number; available: number; ok: boolean };
    python: { required: string; current: string; ok: boolean };
    cuda: { required: string; current: string; ok: boolean };
    disk: { required: number; available: number; ok: boolean };
  };
}

export function CompatibilityChecker({ modelManifest }: { modelManifest: any }) {
  const [compatibility, setCompatibility] = useState<CompatibilityResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkCompatibility();
  }, [modelManifest]);

  const checkCompatibility = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/system/compatibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manifest: modelManifest })
      });
      
      const data = await res.json();
      if (data.success) {
        setCompatibility(data.data);
      }
    } catch (error) {
      console.error('Compatibility check failed:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-white/60">Checking system compatibility...</div>;
  }

  if (!compatibility) {
    return null;
  }

  const StatusIcon = ({ ok }: { ok: boolean }) => 
    ok ? 
      <CheckCircle className="w-4 h-4 text-green-400" /> : 
      <AlertTriangle className="w-4 h-4 text-yellow-400" />;

  return (
    <div className="space-y-4">
      {compatibility.compatible ? (
        <Alert className="bg-green-900/20 border-green-800">
          <CheckCircle className="w-4 h-4 text-green-400" />
          <AlertDescription className="text-green-400">
            System meets all requirements for this model
          </AlertDescription>
        </Alert>
      ) : (
        <Alert className="bg-red-900/20 border-red-800">
          <XCircle className="w-4 h-4 text-red-400" />
          <AlertDescription className="text-red-400">
            System does not meet requirements for this model
          </AlertDescription>
        </Alert>
      )}

      {/* Errors */}
      {compatibility.errors.length > 0 && (
        <Card className="bg-red-900/10 border-red-800/50 p-4">
          <h4 className="font-semibold text-red-400 mb-2">Critical Issues:</h4>
          <ul className="space-y-1">
            {compatibility.errors.map((error, i) => (
              <li key={i} className="text-sm text-red-300 flex gap-2">
                <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                {error}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Warnings */}
      {compatibility.warnings.length > 0 && (
        <Card className="bg-yellow-900/10 border-yellow-800/50 p-4">
          <h4 className="font-semibold text-yellow-400 mb-2">Warnings:</h4>
          <ul className="space-y-1">
            {compatibility.warnings.map((warning, i) => (
              <li key={i} className="text-sm text-yellow-300 flex gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                {warning}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Requirements Breakdown */}
      <Card className="bg-white/5 border-white/10 p-4 space-y-2">
        <h4 className="font-semibold text-white mb-3">System Requirements:</h4>
        
        <div className="flex justify-between items-center">
          <span className="text-white/80">VRAM</span>
          <div className="flex gap-2 items-center">
            <span className="text-white/60 text-sm">
              {compatibility.requirements.vram.required}MB / {compatibility.requirements.vram.available}MB
            </span>
            <StatusIcon ok={compatibility.requirements.vram.ok} />
          </div>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-white/80">Python</span>
          <div className="flex gap-2 items-center">
            <span className="text-white/60 text-sm">
              {compatibility.requirements.python.required} (have {compatibility.requirements.python.current})
            </span>
            <StatusIcon ok={compatibility.requirements.python.ok} />
          </div>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-white/80">CUDA</span>
          <div className="flex gap-2 items-center">
            <span className="text-white/60 text-sm">
              {compatibility.requirements.cuda.required} (have {compatibility.requirements.cuda.current})
            </span>
            <StatusIcon ok={compatibility.requirements.cuda.ok} />
          </div>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-white/80">Disk Space</span>
          <div className="flex gap-2 items-center">
            <span className="text-white/60 text-sm">
              {compatibility.requirements.disk.required}MB / {compatibility.requirements.disk.available}MB
            </span>
            <StatusIcon ok={compatibility.requirements.disk.ok} />
          </div>
        </div>
      </Card>
    </div>
  );
}
