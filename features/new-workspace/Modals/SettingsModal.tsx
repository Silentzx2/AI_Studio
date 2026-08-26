import React, { useState } from 'react';
import { 
  Server, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw
} from 'lucide-react';
import { useWorkspace } from '../store/WorkspaceContext';
import { apiClient } from '../lib/api';

export const SettingsModal: React.FC = () => {
  const {
    isSettingsOpen,
    setIsSettingsOpen,
    systemStats,
    refreshSystemStats
  } = useWorkspace();

  const [host, setHost] = useState(() => {
    // Load saved host from localStorage or use default
    try { return localStorage.getItem('ai3d_api_host') || apiClient.getBaseUrl(); } catch { return apiClient.getBaseUrl(); }
  });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; msg: string } | null>(null);
  const [nodeCount, setNodeCount] = useState<number | null>(null);
  const [nodeError, setNodeError] = useState<string | null>(null);

  React.useEffect(() => {
    if (!isSettingsOpen) return;
    let cancelled = false;
    apiClient.getSystemStats().then(stats => {
      if (!cancelled) {
        setNodeCount(stats.status === 'online' ? 1 : 0);
        setNodeError(null);
      }
    }).catch(error => {
      if (!cancelled) {
        setNodeCount(null);
        setNodeError(error instanceof Error ? error.message : 'Unable to reach backend');
      }
    });
    return () => { cancelled = true; };
  }, [isSettingsOpen]);

  if (!isSettingsOpen) return null;

  const handleSave = () => {
    // Persist host URL to localStorage and update apiClient
    try { localStorage.setItem('ai3d_api_host', host); } catch { /* ignore */ }
    apiClient.setBaseUrl(host);
    setIsSettingsOpen(false);
  };
    setTesting(true);
    setTestResult(null);
    const stats = await apiClient.getSystemStats();
    setTesting(false);
    if (stats.status === 'online') {
      setTestResult({ success: true, msg: 'Connected to AI 3D Studio backend successfully.' });
      refreshSystemStats();
    } else {
      setTestResult({ success: false, msg: `Backend server unreachable. Ensure FastAPI is running.` });
      refreshSystemStats();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 select-none animate-in fade-in duration-200">
      <div className="w-full max-w-xl rounded-2xl bg-[#14161c] border border-[#2e3342] shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-[#181b22] border-b border-[#292e3c]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#202532] border border-[#32394a] flex items-center justify-center text-[#f5c518]">
              <Server className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-[#f3f4f6]">FastAPI Backend Configuration</h3>
              <p className="text-[11px] text-[#8e95a5]">Connect to local or cloud FastAPI + 3D Generation Pipeline instance</p>
            </div>
          </div>
          <button
            onClick={() => setIsSettingsOpen(false)}
            className="p-1.5 rounded-lg text-[#9ca3af] hover:text-[#f3f4f6] hover:bg-[#252936]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-xs">
          {/* Host & Port Input */}
          <div className="space-y-1.5">
            <label className="font-medium text-[#cbd5e1]">Backend Server URL</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="/api/v1"
                className="flex-1 px-3 py-2 rounded-xl bg-[#101115] border border-[#2a2e3c] text-xs font-mono text-[#e5e7eb] focus:border-[#f5c518] outline-none"
              />
              <button
                onClick={handleTestConnection}
                disabled={testing}
                className="px-4 py-2 rounded-xl bg-[#222734] hover:bg-[#2c3345] border border-[#384154] text-[#f5c518] font-bold text-xs flex items-center gap-1.5 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
                <span>{testing ? 'Testing...' : 'Test Link'}</span>
              </button>
            </div>
          </div>

          {/* Test Status Banner */}
          {testResult && (
            <div className={`p-3 rounded-xl border flex items-center gap-2.5 ${
              testResult.success ? 'bg-[#15231c] border-[#22c55e]/40 text-[#86efac]' : 'bg-[#231515] border-[#ef4444]/40 text-[#fca5a5]'
            }`}>
              {testResult.success ? <CheckCircle2 className="w-4 h-4 text-[#22c55e] flex-shrink-0" /> : <AlertCircle className="w-4 h-4 text-[#ef4444] flex-shrink-0" />}
              <span className="text-xs">{testResult.msg}</span>
            </div>
          )}

          {/* Node registry status (real /object_info data) */}
          <div className="space-y-2 pt-2">
            <span className="font-semibold text-xs text-[#8e95a5] uppercase tracking-wider">Backend Status</span>
            <div className="p-3 rounded-xl bg-[#111216] border border-[#232732]">
              {nodeError ? (
                <div className="text-[11px] text-[#fca5a5]">Backend unreachable: {nodeError}</div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-[#cbd5e1]">FastAPI Backend</span>
                  <span className="text-[11px] text-[#f5c518] font-mono">{nodeCount === null ? 'Checking...' : nodeCount > 0 ? 'Online' : 'Offline'}</span>
                </div>
              )}
              <div className="text-[10px] text-[#6b7280] mt-2">AI 3D Studio uses FastAPI backend at /api/v1 for all generation tasks.</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 bg-[#181b22] border-t border-[#292e3c]">
          <button
            onClick={() => setIsSettingsOpen(false)}
            className="px-4 py-2 rounded-xl bg-[#222631] text-[#cbd5e1] hover:bg-[#2b303e] font-medium text-xs transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 rounded-xl bg-[#f5c518] hover:bg-[#eab308] text-[#111216] font-bold text-xs shadow-md shadow-[#f5c518]/20 transition-all"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};
