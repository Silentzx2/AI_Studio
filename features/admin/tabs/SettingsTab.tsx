"use client";


import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Settings, Key, Save, Trash2, Cpu, HardDrive, Server, Wifi, RefreshCw, Palette } from 'lucide-react';
import { GlassCard } from '@/components/premium/GlassCard';
import { Badge } from '@/components/premium/Badge';
import { NeonButton } from '@/components/premium/NeonButton';
import { StatusDot } from '@/components/premium/StatusDot';
import { Spinner } from '@/components/premium/Spinner';
import { adminService } from '@/services/adminService';
import { runtimeService } from '@/services/runtimeService';
import type { RuntimeStatus } from '@/types';
import { toast } from 'sonner';

export function SettingsTab() {
  const [hfToken, setHfToken] = useState('');
  const [hfStatus, setHfStatus] = useState<{ configured: boolean; valid: boolean }>({ configured: false, valid: false });
  const [saving, setSaving] = useState(false);
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(async () => {
    const [status, rt, st] = await Promise.all([
      adminService.getHFTokenStatus(),
      runtimeService.getStatus(),
      adminService.getSettings(),
    ]);
    setHfStatus(status);
    setRuntime(rt);
    setSettings(st);
    setLoading(false);
  }, []);

  useEffect(() => { setTimeout(() => load(), 0); }, [load]);

  const handleSaveToken = async () => {
    if (!hfToken.trim()) return;
    setSaving(true);
    try {
      await adminService.saveHFToken(hfToken);
      setHfStatus({ configured: true, valid: true });
      setHfToken('');
      toast.success('HuggingFace token saved');
    } catch {
      toast.error('Failed to save token');
    }
    setSaving(false);
  };

  const handleRemoveToken = async () => {
    try {
      await runtimeService.removeHFToken();
      setHfStatus({ configured: false, valid: false });
      toast.success('Token removed');
    } catch {
      toast.error('Failed to remove token');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size="lg" />
      </div>
    );
  }

  const systemInfo = [
    { label: 'OS', value: runtime?.os ?? '—', icon: Server },
    { label: 'CPU', value: runtime?.cpu_name ?? '—', icon: Cpu },
    { label: 'RAM', value: runtime?.ram_total ? `${(runtime.ram_total / 1024).toFixed(0)} GB` : '—', icon: HardDrive },
    { label: 'GPU', value: runtime?.gpu_name ?? '—', icon: Cpu },
    { label: 'CUDA', value: runtime?.cuda_version ?? '—', icon: Server },
    { label: 'Driver', value: runtime?.driver_version ?? '—', icon: Wifi },
  ];

  const runtimeConfig = settings ? Object.entries(settings).map(([key, value]) => ({
    label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    value: String(value),
  })) : [];

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-[1200px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">System configuration & API keys</p>
      </div>

      <GlassCard className="p-5" delay={0.03}>
        <div className="flex items-center gap-2 mb-3">
          <Palette className="w-4 h-4 text-[hsl(var(--neon-purple))]" />
          <h3 className="text-sm font-semibold">Theme Manager</h3>
          <Badge variant="neon" className="ml-auto">Global</Badge>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Wallpaper controls were removed. Use the Appearance page to tune global UI color, density, motion, and theme behavior.
        </p>
      </GlassCard>

      <GlassCard className="p-5" delay={0.05}>
        <div className="flex items-center gap-2 mb-4">
          <Server className="w-4 h-4 text-[hsl(var(--neon-cyan))]" />
          <h3 className="text-sm font-semibold">System Information</h3>
          <button onClick={load} className="ml-auto p-1.5 rounded-lg hover:bg-[hsl(var(--surface-2))] text-muted-foreground hover:text-foreground">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {systemInfo.map((info, i) => {
            const Icon = info.icon;
            return (
              <motion.div key={info.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="flex items-center gap-3 p-3 rounded-xl glass border border-[hsl(var(--border)/0.3)]">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-surface-2">
                  <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{info.label}</p>
                  <p className="text-sm font-medium text-foreground">{info.value}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </GlassCard>

      <GlassCard className="p-5" delay={0.1}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-[hsl(var(--neon-purple))]" />
            <h3 className="text-sm font-semibold">HuggingFace Token</h3>
          </div>
          <Badge variant={hfStatus.configured ? (hfStatus.valid ? 'success' : 'warning') : 'default'}>
            <StatusDot status={hfStatus.configured ? (hfStatus.valid ? 'online' : 'warning') : 'idle'} size="sm" pulse={false} />
            {hfStatus.configured ? (hfStatus.valid ? 'Valid' : 'Invalid') : 'Not Set'}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Required for downloading models from HuggingFace Hub. Your token is stored securely and never exposed.
        </p>
        <div className="flex items-center gap-2">
          <input
            type="password"
            value={hfToken}
            onChange={(e) => setHfToken(e.target.value)}
            placeholder="hf_xxxxxxxxxxxxxxxxxxxx"
            className="flex-1 h-10 px-4 rounded-xl glass text-sm border border-[hsl(var(--border)/0.5)] focus:border-[hsl(var(--neon-purple)/0.4)] focus:outline-none font-mono"
          />
          <NeonButton variant="primary" size="md" onClick={handleSaveToken} disabled={saving || !hfToken.trim()}>
            <Save className="w-3.5 h-3.5" />
            Save
          </NeonButton>
          {hfStatus.configured && (
            <NeonButton variant="destructive" size="md" onClick={handleRemoveToken}>
              <Trash2 className="w-3.5 h-3.5" />
            </NeonButton>
          )}
        </div>
      </GlassCard>

      {runtimeConfig.length > 0 && (
        <GlassCard className="p-5" delay={0.15}>
          <div className="flex items-center gap-2 mb-4">
            <Settings className="w-4 h-4 text-[hsl(var(--neon-blue))]" />
            <h3 className="text-sm font-semibold">Runtime Configuration</h3>
          </div>
          <div className="space-y-3">
            {runtimeConfig.map((config) => (
              <div key={config.label} className="flex items-center justify-between p-3 rounded-xl glass border border-[hsl(var(--border)/0.3)]">
                <span className="text-sm text-muted-foreground">{config.label}</span>
                <span className="text-sm font-mono text-foreground">{config.value}</span>
              </div>
            ))}
          </div>
        </GlassCard>
      )}
    </div>
  );
}
