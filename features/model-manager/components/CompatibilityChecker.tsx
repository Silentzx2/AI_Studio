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
    return <div className="text-[hsl(var(--foreground))]/60">Checking system compatibility...</div>;
  }

  if (!compatibility) {
    return null;
  }

  const StatusIcon = ({ ok }: { ok: boolean }) => 
    ok ? 
      <CheckCircle className="w-4 h-4 text-[hsl(var(--neon-green))]" /> : 
      <AlertTriangle className="w-4 h-4 text-[hsl(var(--neon-amber))]" />;

  return (
    <div className="space-y-4">
      {compatibility.compatible ? (
        <Alert className="bg-[hsl(var(--neon-green)/0.2)] border-[hsl(var(--surface-2))]">
          <CheckCircle className="w-4 h-4 text-[hsl(var(--neon-green))]" />
          <AlertDescription className="text-[hsl(var(--neon-green))]">
            System meets all requirements for this model
          </AlertDescription>
        </Alert>
      ) : (
        <Alert className="bg-[hsl(var(--destructive)/0.2)] border-[hsl(var(--destructive))]">
          <XCircle className="w-4 h-4 text-[hsl(var(--destructive))]" />
          <AlertDescription className="text-[hsl(var(--destructive))]">
            System does not meet requirements for this model
          </AlertDescription>
        </Alert>
      )}

      {/* Errors */}
      {compatibility.errors.length > 0 && (
        <Card className="bg-[hsl(var(--destructive)/0.1)] border-[hsl(var(--destructive))]/50 p-4">
          <h4 className="font-semibold text-[hsl(var(--destructive))] mb-2">Critical Issues:</h4>
          <ul className="space-y-1">
            {compatibility.errors.map((error, i) => (
              <li key={i} className="text-sm text-[hsl(var(--destructive))] flex gap-2">
                <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                {error}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Warnings */}
      {compatibility.warnings.length > 0 && (
        <Card className="bg-[hsl(var(--neon-amber)/0.1)] border-[hsl(var(--neon-amber)/0.5)] p-4">
          <h4 className="font-semibold text-[hsl(var(--neon-amber))] mb-2">Warnings:</h4>
          <ul className="space-y-1">
            {compatibility.warnings.map((warning, i) => (
              <li key={i} className="text-sm text-[hsl(var(--neon-amber))] flex gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                {warning}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Requirements Breakdown */}
      <Card className="bg-[hsl(var(--surface-2))] border-[hsl(var(--border))]/[0.3] p-4 space-y-2">
        <h4 className="font-semibold text-[hsl(var(--foreground))] mb-3">System Requirements:</h4>
        
        <div className="flex justify-between items-center">
          <span className="text-[hsl(var(--foreground))]/80">VRAM</span>
          <div className="flex gap-2 items-center">
            <span className="text-[hsl(var(--foreground))]/60 text-sm">
              {compatibility.requirements.vram.required}MB / {compatibility.requirements.vram.available}MB
            </span>
            <StatusIcon ok={compatibility.requirements.vram.ok} />
          </div>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-[hsl(var(--foreground))]/80">Python</span>
          <div className="flex gap-2 items-center">
            <span className="text-[hsl(var(--foreground))]/60 text-sm">
              {compatibility.requirements.python.required} (have {compatibility.requirements.python.current})
            </span>
            <StatusIcon ok={compatibility.requirements.python.ok} />
          </div>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-[hsl(var(--foreground))]/80">CUDA</span>
          <div className="flex gap-2 items-center">
            <span className="text-[hsl(var(--foreground))]/60 text-sm">
              {compatibility.requirements.cuda.required} (have {compatibility.requirements.cuda.current})
            </span>
            <StatusIcon ok={compatibility.requirements.cuda.ok} />
          </div>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-[hsl(var(--foreground))]/80">Disk Space</span>
          <div className="flex gap-2 items-center">
            <span className="text-[hsl(var(--foreground))]/60 text-sm">
              {compatibility.requirements.disk.required}MB / {compatibility.requirements.disk.available}MB
            </span>
            <StatusIcon ok={compatibility.requirements.disk.ok} />
          </div>
        </div>
      </Card>
    </div>
  );
}
