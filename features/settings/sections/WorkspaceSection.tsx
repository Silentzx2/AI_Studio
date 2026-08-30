"use client";


import React, { useState, useEffect } from 'react';
import { apiClient } from '@/services/apiClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, Loader2, Check, FolderOpen } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useAutoSave } from '@/hooks/useAutoSave';

interface WorkspaceConfig {
  defaultLocation: string;
  autoSave: boolean;
  autoSaveInterval: number;
  maxRecentProjects: number;
  clearHistoryOnExit: boolean;
}

export function WorkspaceSection() {
  const [config, setConfig] = useState<WorkspaceConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const { Indicator } = useAutoSave(config, async (data) => {
    if (!data) return;
    await apiClient.post('/api/v1/settings/workspace', data);
  }, 1000, true);

  useEffect(() => {
    let active = true;
    apiClient.get<any>('/api/v1/settings/workspace')
      .then((response) => {
        if (!active) return;
        const payload = response?.data ?? response ?? {};
        setConfig(payload);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Failed to load workspace configuration');
        setConfig(null);
        setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const clearHistory = async () => {
    try {
      setSaving(true);
      setError(null);

      await apiClient.post('/api/v1/settings/workspace/clear-history');

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear history');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <Indicator />
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Workspace Settings</h1>
        <p className="text-muted-foreground mt-2">Configure your workspace behavior and storage</p>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-success/10 border border-success/20 text-success">
          <Check className="w-5 h-5 flex-shrink-0" />
          <span>Settings saved successfully</span>
        </div>
      )}

      {config && (
        <>
          {/* Default Location */}
          <Card>
            <CardHeader>
              <CardTitle>Default Workspace Location</CardTitle>
              <CardDescription>Where your projects are stored by default</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  value={config.defaultLocation}
                  onChange={(e) => setConfig({ ...config, defaultLocation: e.target.value })}
                  placeholder="/path/to/workspace"
                  className="flex-1"
                />
                <Button variant="outline" size="sm">
                  <FolderOpen className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Set the default location for saving workspace files
              </p>
            </CardContent>
          </Card>

          {/* Auto-Save Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Auto-Save Settings</CardTitle>
              <CardDescription>Automatically save your work</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div>
                  <p className="font-medium">Enable Auto-Save</p>
                  <p className="text-sm text-muted-foreground">Automatically save changes</p>
                </div>
                <Switch
                  checked={config.autoSave}
                  onCheckedChange={(checked) => setConfig({ ...config, autoSave: checked })}
                />
              </div>

              {config.autoSave && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Auto-Save Interval (seconds)
                  </label>
                  <Input
                    type="number"
                    min="10"
                    max="300"
                    value={config.autoSaveInterval}
                    onChange={(e) => setConfig({ ...config, autoSaveInterval: parseInt(e.target.value) })}
                  />
                  <p className="text-xs text-muted-foreground">
                    How often to save changes (10-300 seconds)
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Projects */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Projects</CardTitle>
              <CardDescription>Manage your project history</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Maximum Recent Projects
                </label>
                <Input
                  type="number"
                  min="5"
                  max="50"
                  value={config.maxRecentProjects}
                  onChange={(e) => setConfig({ ...config, maxRecentProjects: parseInt(e.target.value) })}
                />
                <p className="text-xs text-muted-foreground">
                  Number of recent projects to keep in history
                </p>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div>
                  <p className="font-medium text-sm">Clear History on Exit</p>
                  <p className="text-xs text-muted-foreground">Automatically clear history when closing</p>
                </div>
                <Switch
                  checked={config.clearHistoryOnExit}
                  onCheckedChange={(checked) => setConfig({ ...config, clearHistoryOnExit: checked })}
                />
              </div>

              <Button 
                variant="destructive" 
                className="w-full"
                onClick={clearHistory}
                disabled={saving}
              >
                {saving ? 'Clearing...' : 'Clear History Now'}
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
